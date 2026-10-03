import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { JianweiSearchTools, JianweiEvidenceQuestion, findReportEvidence } from '../src/JianweiSearchTools';
import type { Evidence, RiskAnalysis } from '../src/api/consumer';

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const source = (id: string, excerpt: string) => ({ id, excerpt, title: '报告来源', publisher: '公开网站' } as Evidence);

describe('search tools', () => {
  it('hides map lookup when the service is not configured', async () => {
    const json = vi.fn().mockResolvedValue({ configured: false, message: '地图尚未启用，可直接填写地址。' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json }));
    render(<JianweiSearchTools onSelectPlace={vi.fn()}/>);
    await waitFor(() => expect(json).toHaveBeenCalled());
    expect(screen.queryByText('找不到准确地址？')).toBeNull();
    expect(screen.queryByText('从地图选门店 ↗')).toBeNull();
    expect(screen.queryByRole('button', { name: '查找地点' })).toBeNull();
  });

  it('passes only the chosen place back to the existing form', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ configured: true, message: '可查地点' }) }).mockResolvedValueOnce({ ok: true, json: async () => ({ places: [{ id: 'P1', name: '示例店', address: '杭州市示例路', city: '杭州', district: '', marker_url: '', relationship_status: '经营主体待核对' }] }) }));
    const choose = vi.fn();
    render(<JianweiSearchTools onSelectPlace={choose}/>);
    fireEvent.click(await screen.findByText('从地图选门店 ↗'));
    fireEvent.change(await screen.findByPlaceholderText('门店或品牌名称'), { target: { value: '示例店' } });
    fireEvent.click(screen.getByRole('button', { name: '查找地点' }));
    await waitFor(() => expect(screen.getByText('示例店')).toBeTruthy());
    expect(choose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '使用这家门店 →' }));
    expect(choose).toHaveBeenCalledWith('示例店', '杭州市示例路');
  });

  it('returns only literal report evidence and leaves unmatched questions unanswered', () => {
    const rows = [source('a', '申请退款已受理。'), source('b', '公司名称变更。')];
    expect(findReportEvidence(rows, '退款').map(item => item.id)).toEqual(['a']);
    expect(findReportEvidence(rows, '破产')).toEqual([]);
    expect(findReportEvidence(rows, '   ')).toEqual([]);
  });

  it('asks only about bounded current report excerpts and shows citations', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ answerable: true, answer: '材料没有披露退款完成日期。', citations: [{ source_id: 'a', quote: '尚未披露完成日期' }], scope: '未执行新的联网查询。' }) });
    vi.stubGlobal('fetch', fetch);
    const report = { analysis_id: 'report-a', identity: { name: '测试企业' }, sources: [{ ...source('a', '退款申请已受理，尚未披露完成日期。'), url: 'https://example.com/source', verification_status: 'page_text' }] } as RiskAnalysis;
    render(<JianweiEvidenceQuestion report={report}/>);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '退款完成了吗？' } });
    fireEvent.click(screen.getByRole('button', { name: '根据报告回答' }));
    expect(await screen.findByText('材料没有披露退款完成日期。')).toBeTruthy();
    expect(screen.getByRole('link', { name: '查看原文 ↗' }).getAttribute('href')).toBe('https://example.com/source');
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.sources[0].id).toBe('a');
    expect(body.company).toBe('测试企业');
    expect(body.sources[0]).not.toHaveProperty('url');
  });

  it('does not invent an answer when the model is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({ detail: { message: '报告问答模型尚未启用。' } }) }));
    const report = { analysis_id: 'report-b', identity: { name: '测试企业' }, sources: [{ ...source('a', '退款申请已受理。'), verification_status: 'page_text' }] } as RiskAnalysis;
    render(<JianweiEvidenceQuestion report={report}/>);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '退款完成了吗？' } });
    fireEvent.click(screen.getByRole('button', { name: '根据报告回答' }));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', '报告问答模型尚未启用。');
    expect(screen.queryByRole('link', { name: '查看原文 ↗' })).toBeNull();
  });
});
