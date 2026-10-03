"""Repeat searches stay fresh without spending network or model quota."""
import asyncio
import time
from fastapi import HTTPException, Response
import pytest

from app.api import consumer as api
from app.schemas.consumer import DiscoveryInput, Step
from app.services import consumer, consumer_search as web


NAME = '测试门店服务有限公司'


@pytest.fixture
def repeat_search(monkeypatch):
    jobs, saved, searches = {}, {}, []
    monkeypatch.setattr(api, 'jobs', jobs)
    monkeypatch.setattr(api, 'gate', asyncio.Semaphore(3))

    async def search(query, purpose):
        searches.append((query, purpose))
        row = web.make_source(NAME + '公开资料', 'https://research.example/repeat',
                              NAME + '发布门店服务安排，具体经营主体仍需确认。', purpose)
        return [row], Step(action=purpose, status='completed', detail='受控公开检索', source_ids=[row.id])

    async def read(_source):
        return ''

    async def registry(_query):
        return [], Step(action='企查查', status='not_configured', detail='测试隔离外部接口'), None

    monkeypatch.setattr(web, 'search', search)
    monkeypatch.setattr(web, 'read_page', read)
    monkeypatch.setattr(consumer, 'lookup', registry)
    monkeypatch.setattr(consumer.cache, 'save', lambda value: saved.update({value.investigation_id: value}))
    monkeypatch.setattr(consumer.cache, 'get', lambda ident=None, **_kwargs: saved.get(ident))
    return jobs, saved, searches


def test_same_store_can_complete_more_than_thirty_fresh_searches(repeat_search):
    jobs, saved, searches = repeat_search

    async def run():
        job_ids, investigation_ids = [], []
        for _ in range(35):
            response = await api.start_discovery_job(DiscoveryInput(query=NAME), Response())
            ident = response['job_id']
            await asyncio.wait_for(jobs[ident]['task'], timeout=2)
            value = await api.get_job(ident, Response())
            assert value['status'] == 'completed'
            assert value['result']['query'] == NAME
            assert value['result']['mode'] == 'live_search'
            assert value['result']['candidates']
            job_ids.append(ident)
            investigation_ids.append(value['result']['investigation_id'])
            assert len(jobs) <= 30
        assert len(set(job_ids)) == len(set(investigation_ids)) == 35
        assert len(saved) == 35
        assert len(searches) == 35 * 3
        assert len(set(job_ids).intersection(jobs)) == 30
        assert job_ids[-1] in jobs

    asyncio.run(run())


def test_terminal_history_at_capacity_does_not_block_a_new_search(repeat_search):
    jobs, _saved, _searches = repeat_search

    async def run():
        completed_task = asyncio.create_task(asyncio.sleep(0))
        await completed_task
        expires = time.monotonic() + 1000
        for index in range(30):
            jobs[f'old-{index:02d}'] = {
                'status': ('completed', 'failed', 'cancelled')[index % 3],
                'message': '历史记录',
                'expires': expires + index, 'result': None, 'task': completed_task,
            }
        response = await api.start_discovery_job(DiscoveryInput(query=NAME), Response())
        ident = response['job_id']
        assert len(jobs) == 30
        assert 'old-00' not in jobs
        assert 'old-01' in jobs
        await asyncio.wait_for(jobs[ident]['task'], timeout=2)
        assert (await api.get_job(ident, Response()))['status'] == 'completed'

    asyncio.run(run())


def test_three_active_searches_still_limit_concurrency_and_release_capacity(repeat_search, monkeypatch):
    jobs, _saved, _searches = repeat_search

    async def run():
        release = asyncio.Event()
        real_discovery = consumer.discovery

        async def waiting_discovery(body):
            await release.wait()
            return await real_discovery(body)

        monkeypatch.setattr(consumer, 'discovery', waiting_discovery)
        tasks = []
        try:
            for _ in range(3):
                response = await api.start_discovery_job(DiscoveryInput(query=NAME), Response())
                tasks.append(jobs[response['job_id']]['task'])
            with pytest.raises(HTTPException) as failure:
                await api.start_discovery_job(DiscoveryInput(query=NAME), Response())
            assert failure.value.status_code == 429
            assert len(jobs) == 3
            release.set()
            await asyncio.wait_for(asyncio.gather(*tasks), timeout=2)
            assert all(job['status'] == 'completed' for job in jobs.values())
            response = await api.start_discovery_job(DiscoveryInput(query=NAME), Response())
            tasks.append(jobs[response['job_id']]['task'])
            await asyncio.wait_for(tasks[-1], timeout=2)
            assert jobs[response['job_id']]['status'] == 'completed'
        finally:
            release.set()
            for task in tasks:
                if not task.done():
                    task.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)

    asyncio.run(run())
