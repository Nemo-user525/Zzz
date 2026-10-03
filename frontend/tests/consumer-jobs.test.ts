import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { consumerApi } from '../src/api/consumer';

const response=(value:unknown)=>({ok:true,status:200,json:async()=>value});
beforeEach(()=>vi.useFakeTimers());
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});

it('uses a fresh job for each same-name search',async()=>{
 const fetch=vi.fn()
  .mockResolvedValueOnce(response({job_id:'first'}))
  .mockResolvedValueOnce(response({status:'completed',message:'检索完成',result:{investigation_id:'one'}}))
  .mockResolvedValueOnce(response({job_id:'second'}))
  .mockResolvedValueOnce(response({status:'completed',message:'检索完成',result:{investigation_id:'two'}}));
 vi.stubGlobal('fetch',fetch);
 expect(await consumerApi.discover('同一家店','杭州')).toEqual({investigation_id:'one'});
 expect(await consumerApi.discover('同一家店','杭州')).toEqual({investigation_id:'two'});
 expect(fetch.mock.calls.map(call=>call[0])).toEqual(['/api/consumer/discovery/jobs','/api/consumer/jobs/first','/api/consumer/discovery/jobs','/api/consumer/jobs/second']);
});

it('recovers a lost job response without creating another job',async()=>{
 const fetch=vi.fn()
  .mockResolvedValueOnce(response({job_id:'recover'}))
  .mockResolvedValueOnce(response({status:'running',message:'检索来源',result:null}))
  .mockRejectedValueOnce(new TypeError('Failed to fetch'))
  .mockResolvedValueOnce(response({status:'running',message:'读取原文',result:null}))
  .mockResolvedValueOnce(response({status:'completed',message:'检索完成',result:{investigation_id:'done'}}));
 vi.stubGlobal('fetch',fetch);
 const task=consumerApi.discover('测试门店','');
 await vi.advanceTimersByTimeAsync(6000);
 expect(await task).toEqual({investigation_id:'done'});
 expect(fetch.mock.calls.filter(call=>call[1]?.method==='POST')).toHaveLength(1);
});

it('allows a new request after a failed job',async()=>{
 const fetch=vi.fn()
  .mockResolvedValueOnce(response({job_id:'failed'}))
  .mockResolvedValueOnce(response({status:'failed',message:'来源暂不可用，请重试',result:null}))
  .mockResolvedValueOnce(response({}))
  .mockResolvedValueOnce(response({job_id:'retry'}))
  .mockResolvedValueOnce(response({status:'completed',message:'完成',result:{investigation_id:'retry'}}));
 vi.stubGlobal('fetch',fetch);
 await expect(consumerApi.discover('测试门店','')).rejects.toThrow('来源暂不可用');
 expect(await consumerApi.discover('测试门店','')).toEqual({investigation_id:'retry'});
});

it('cancels the job and stops polling when the user cancels',async()=>{
 const fetch=vi.fn()
  .mockResolvedValueOnce(response({job_id:'cancel'}))
  .mockResolvedValueOnce(response({status:'running',message:'读取资料',result:null}))
  .mockResolvedValue(response({}));
 vi.stubGlobal('fetch',fetch);
 const controller=new AbortController();
 const result=consumerApi.discover('测试门店','',controller.signal).catch(error=>error);
 await vi.advanceTimersByTimeAsync(0);
 controller.abort();
 expect((await result).name).toBe('AbortError');
 await vi.advanceTimersByTimeAsync(6000);
 expect(fetch.mock.calls.filter(call=>call[1]?.method==='GET')).toHaveLength(1);
 expect(fetch.mock.calls.some(call=>call[0]==='/api/consumer/jobs/cancel'&&call[1]?.method==='DELETE')).toBe(true);
});
