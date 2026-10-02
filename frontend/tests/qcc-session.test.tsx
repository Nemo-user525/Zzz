import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { QccSession } from '../src/QccSession';

afterEach(()=>{cleanup();vi.unstubAllGlobals();});

it('opens local login setup and clears the cookie field after configuring',async()=>{
  const fetcher=vi.fn().mockResolvedValueOnce({ok:true,json:async()=>({configured:false,status:'not_configured',configurable:true})})
    .mockResolvedValueOnce({ok:true,json:async()=>({configured:true,status:'ready'})});
  vi.stubGlobal('fetch',fetcher);
  render(<QccSession active={false}/>);
  await screen.findByText('登录企查查并配置本人 Cookie');
  expect(screen.getByRole('link',{name:'打开企查查并登录 ↗'}).getAttribute('href')).toBe('https://www.qcc.com/');
  const input=screen.getByLabelText('企查查 Cookie') as HTMLInputElement;
  expect(input.type).toBe('password');
  fireEvent.change(input,{target:{value:'session=test-only'}});
  fireEvent.click(screen.getByRole('button',{name:'配置本次会话'}));
  await waitFor(()=>expect(input.value).toBe(''));
  expect(fetcher.mock.calls[1][0]).toBe('/api/consumer/qcc-session');
  expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({cookie:'session=test-only'});
  expect(screen.queryByText('session=test-only')).toBeNull();
});

it('does not expose configuration on a public deployment',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({configured:false,status:'not_configured',configurable:false})}));
  render(<QccSession active={false}/>);
  await waitFor(()=>expect(fetch).toHaveBeenCalled());
  expect(screen.queryByRole('dialog')).toBeNull();
});
