import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { QccSession } from '../src/QccSession';

afterEach(()=>{cleanup();vi.unstubAllGlobals();});

it('shows WorkBuddy connection state without opening the legacy cookie drawer',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({provider:'workbuddy',configured:false,status:'not_configured',configurable:false,message:'请先配置 WorkBuddy 开放平台应用。'})}));
  render(<QccSession active={false}/>);
  await screen.findByText('企查查 · WorkBuddy 自动查询');
  expect(screen.getByRole('status').textContent).toContain('请先配置 WorkBuddy');
  expect(screen.queryByLabelText('企查查 Cookie')).toBeNull();
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.queryByRole('button',{name:'配置 WorkBuddy'})).toBeNull();
});

it('saves WorkBuddy application configuration locally and clears the secret',async()=>{
  const fetcher=vi.fn().mockResolvedValueOnce({ok:true,json:async()=>({provider:'workbuddy',configured:false,status:'not_configured',configurable:true,app_configured:false})})
    .mockResolvedValueOnce({ok:true,json:async()=>({provider:'workbuddy',configured:false,status:'auth_required',app_configured:true})});
  vi.stubGlobal('fetch',fetcher);
  render(<QccSession active={false}/>);
  fireEvent.click(await screen.findByRole('button',{name:'配置 WorkBuddy'}));
  expect(screen.getByRole('link',{name:/打开 WorkBuddy 开放平台/}).getAttribute('href')).toBe('https://open.workbuddy.cn/');
  expect(screen.getByRole('button',{name:'授权连接 WorkBuddy'}).hasAttribute('disabled')).toBe(true);
  fireEvent.change(screen.getByLabelText('WorkBuddy Client ID'),{target:{value:'app-test'}});
  const secret=screen.getByLabelText('WorkBuddy Client Secret') as HTMLInputElement;
  expect(secret.type).toBe('password');
  fireEvent.change(secret,{target:{value:'test-secret'}});
  fireEvent.click(screen.getByRole('button',{name:'保存本机配置'}));
  await waitFor(()=>expect(secret.value).toBe(''));
  expect(fetcher.mock.calls[1][0]).toBe('/api/consumer/workbuddy/config');
  expect(JSON.parse(fetcher.mock.calls[1][1].body).client_secret).toBe('test-secret');
  expect(screen.getByRole('button',{name:'授权连接 WorkBuddy'}).hasAttribute('disabled')).toBe(false);
  expect(screen.queryByText('test-secret')).toBeNull();
  fireEvent.change(secret,{target:{value:'unsaved-secret'}});
  fireEvent.click(screen.getByRole('button',{name:'关闭详情'}));
  fireEvent.click(screen.getByRole('button',{name:'配置 WorkBuddy'}));
  expect((screen.getByLabelText('WorkBuddy Client Secret') as HTMLInputElement).value).toBe('');
});

it('reports an authorization failure without leaving the configuration page',async()=>{
  const fetcher=vi.fn().mockResolvedValueOnce({ok:true,json:async()=>({provider:'workbuddy',configured:false,status:'auth_required',configurable:true,app_configured:true})})
    .mockResolvedValueOnce({ok:false,json:async()=>({message:'请用注册回调地址的同一主机名打开本页再授权'})});
  vi.stubGlobal('fetch',fetcher);
  render(<QccSession active={false}/>);
  fireEvent.click(await screen.findByRole('button',{name:'配置 WorkBuddy'}));
  fireEvent.click(screen.getByRole('button',{name:'授权连接 WorkBuddy'}));
  await screen.findByText('请用注册回调地址的同一主机名打开本页再授权');
  expect(fetcher.mock.calls[1][0]).toBe('/api/consumer/workbuddy/authorize');
});

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

it('opens the website verification prompt even when a cookie is configured',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({configured:true,status:'verification_required',configurable:true})}));
  render(<QccSession active={false}/>);
  await screen.findByText('登录企查查并配置本人 Cookie');
  expect(screen.getByRole('status').textContent).toContain('尚未取得公司正文');
  expect(screen.getByRole('link',{name:'打开企查查并登录 ↗'}).getAttribute('href')).toBe('https://www.qcc.com/');
  expect((screen.getByLabelText('企查查 Cookie') as HTMLInputElement).value).toBe('');
});
