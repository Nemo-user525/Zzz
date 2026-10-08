import {act, cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {afterEach, expect, it, vi} from 'vitest';
import DiscoveryFlow from '../src/DiscoveryFlow';
import {discoveryApi} from '../src/api/discovery';
import {consumerApi} from '../src/api/consumer';

afterEach(()=>{cleanup();vi.restoreAllMocks();});

it('automatically evaluates store reviews when no company matches and retains the selected address',async()=>{
  const place={id:'poi',name:'测试健身房（文一路店）',address:'文一路10号',city:'杭州',district:'西湖区',province:'浙江',adcode:'330106',location:'120.1,30.2',type:'健身',provider:'高德'};
  vi.spyOn(discoveryApi,'integrations').mockResolvedValue({amap:{configured:true,provider:'高德'},qcc:{configured:true,provider:'企查查'}});
  vi.spyOn(discoveryApi,'regions').mockResolvedValue({provider:'高德',parent:'100000',regions:[]});
  vi.spyOn(discoveryApi,'places').mockResolvedValue({provider:'高德',places:[place],street_filter_note:'',identity_note:''});
  vi.spyOn(discoveryApi,'legalEntities').mockResolvedValue({provider:'企查查',companies:[],identity_note:''});
  vi.spyOn(discoveryApi,'storeReviews').mockResolvedValue({investigation_id:'store-inv',candidates:[{id:'store-target'}]} as never);
  const analyse=vi.spyOn(consumerApi,'analyse').mockResolvedValue({identity:{name:place.name},sources:[],trace:[],risk:{level:'undetermined',label:'证据不足，暂不评级',reasons:[],limitations:[],explanation:'未取得可核实的门店反馈。'},reviews:{collected_count:0,reviewed_count:0,counts:{},observations:[]}} as never);
  render(<DiscoveryFlow/>);
  await waitFor(()=>expect((screen.getByRole('button',{name:/搜索实际门店/}) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.change(screen.getByPlaceholderText('例如：某健身品牌'),{target:{value:'测试健身房'}});
  fireEvent.click(screen.getByRole('button',{name:/搜索实际门店/}));
  fireEvent.click(await screen.findByRole('button',{name:/选这家门店/}));
  await screen.findByLabelText('门店评价风险报告');
  expect(discoveryApi.storeReviews).toHaveBeenCalledWith(place,expect.anything());
  expect(analyse).toHaveBeenCalledWith('store-inv','store-target',expect.anything(),expect.anything(),expect.anything());
  expect(screen.getByText(/无法代表全网全部评论/)).toBeTruthy();
});

it('discards an older store investigation after selecting another branch',async()=>{
  const places=['甲店','乙店'].map((name,i)=>({id:String(i),name,address:`${name}路10号`,city:'杭州',district:'西湖区',province:'浙江',adcode:'330106',location:'120.1,30.2',type:'健身',provider:'高德'}));
  vi.spyOn(discoveryApi,'integrations').mockResolvedValue({amap:{configured:true,provider:'高德'},qcc:{configured:true,provider:'企查查'}});
  vi.spyOn(discoveryApi,'regions').mockResolvedValue({provider:'高德',parent:'100000',regions:[]});
  vi.spyOn(discoveryApi,'places').mockResolvedValue({provider:'高德',places,street_filter_note:'',identity_note:''});
  vi.spyOn(discoveryApi,'legalEntities').mockResolvedValue({provider:'企查查',companies:[],identity_note:''});
  vi.spyOn(discoveryApi,'storeReviews').mockImplementation(async place=>({investigation_id:place.id,candidates:[{id:place.id}]} as never));
  let finish!:(value:never)=>void;
  vi.spyOn(consumerApi,'analyse').mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;})).mockResolvedValue({identity:{name:'乙店'},sources:[],trace:[]} as never);
  render(<DiscoveryFlow/>);
  await waitFor(()=>expect((screen.getByRole('button',{name:/搜索实际门店/}) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.change(screen.getByPlaceholderText('例如：某健身品牌'),{target:{value:'测试健身房'}});
  fireEvent.click(screen.getByRole('button',{name:/搜索实际门店/}));
  await screen.findAllByRole('button',{name:/选这家门店/});
  fireEvent.click(screen.getAllByRole('button',{name:/选这家门店/})[0]);
  await waitFor(()=>expect(consumerApi.analyse).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByRole('button',{name:/选这家门店/}));
  await screen.findByLabelText('门店评价风险报告');
  await act(async()=>{finish({identity:{name:'过期甲店'},sources:[],trace:[]} as never);});
  expect(screen.queryByText('过期甲店')).toBeNull();
  expect(screen.getByRole('heading',{name:'乙店'})).toBeTruthy();
});
