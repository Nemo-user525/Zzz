import {useEffect,useRef,useState} from 'react';
import type {FormEvent} from 'react';
import './chat.css';

type Message={id:number;role:'user'|'assistant';text:string};
type ChatEvent={type:'context'|'delta'|'done'|'error';company?:string|null;content?:string;message?:string};

export default function ChatSection({company}:{company:string}){
  const [messages,setMessages]=useState<Message[]>([]);
  const [draft,setDraft]=useState('');
  const [activeCompany,setActiveCompany]=useState(company);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const nextId=useRef(1);
  const currentRequest=useRef<AbortController|null>(null);
  useEffect(()=>setActiveCompany(company),[company]);
  useEffect(()=>()=>currentRequest.current?.abort(),[]);

  async function send(event:FormEvent){
    event.preventDefault();
    const message=draft.trim();
    if(!message||busy)return;
    const userId=nextId.current++;
    const answerId=nextId.current++;
    setMessages(prev=>[...prev,{id:userId,role:'user',text:message},{id:answerId,role:'assistant',text:''}]);
    setDraft('');setBusy(true);setError('');
    const controller=new AbortController();
    currentRequest.current=controller;
    try{
      const response=await fetch('/api/chat',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({message,company:activeCompany}),signal:controller.signal,
      });
      if(!response.ok||!response.body)throw new Error('对话服务暂时不可用，请稍后重试。');
      const reader=response.body.getReader();
      const decoder=new TextDecoder();
      let buffer='';
      function processFrame(frame:string){
        const line=frame.split('\n').find(part=>part.startsWith('data:'));
        if(!line)return;
        const data=JSON.parse(line.slice(5)) as ChatEvent;
        if(data.type==='context'&&data.company)setActiveCompany(data.company);
        if(data.type==='delta'&&data.content)setMessages(prev=>prev.map(item=>item.id===answerId?{...item,text:item.text+data.content}:item));
        if(data.type==='error')setError('实时服务遇到问题，正在返回备用回答。');
      }
      while(true){
        const {done,value}=await reader.read();
        if(done)break;
        buffer+=decoder.decode(value,{stream:true}).replace(/\r\n/g,'\n');
        const frames=buffer.split('\n\n');
        buffer=frames.pop()||'';
        for(const frame of frames)processFrame(frame);
      }
      if(buffer.trim())processFrame(buffer);
    }catch(cause){
      if(controller.signal.aborted)return;
      setError(cause instanceof Error?cause.message:'对话服务暂时不可用，请稍后重试。');
      setMessages(prev=>prev.filter(item=>item.id!==answerId||item.text));
    }finally{
      if(currentRequest.current===controller)currentRequest.current=null;
      setBusy(false);
    }
  }

  return <section className="xr-chat" id="chat" aria-labelledby="chat-title">
    <div className="xr-chat-intro"><span className="xr-section-label">X-RAY / 02 · ASK THE EVIDENCE</span><h2 id="chat-title">还有疑问，<br/><em>接着问。</em></h2><p>输入企业全称或具体问题。对话会结合可取得的企业资料作答，并说明资料缺口；选择过企业报告后，可继续追问该主体。</p><div className="xr-chat-examples"><button type="button" onClick={()=>setDraft('杭州乐刻网络技术有限公司的工商变更有哪些？')}>查工商变更 ↗</button><button type="button" onClick={()=>setDraft('这家公司的实缴出资和参保人数是多少？')}>查实缴与参保 ↗</button></div></div>
    <div className="xr-chat-panel">
      <div className="xr-chat-panel-head"><strong>见微 · 查证对话</strong><span>{busy?'正在查证…':'可以开始提问'}</span></div>
      {activeCompany&&<div className="xr-chat-context">当前讨论：{activeCompany} <button type="button" onClick={()=>setActiveCompany('')} aria-label="清除企业上下文">×</button></div>}
      <div className="xr-chat-messages" role="log" aria-live="polite">
        {messages.length===0&&<div className="xr-chat-empty"><strong>把问题交给见微。</strong><p>例如：“杭州乐刻网络技术有限公司最近有什么工商变更？”</p></div>}
        {messages.map(item=><div className={`xr-chat-message ${item.role}`} key={item.id}><span>{item.role==='user'?'你':'见微'}</span><p>{item.text||'正在整理资料…'}</p></div>)}
      </div>
      {error&&<p className="xr-chat-error" role="alert">{error}</p>}
      <form onSubmit={send} className="xr-chat-form"><label htmlFor="xr-chat-input">继续查证</label><textarea id="xr-chat-input" value={draft} onChange={e=>setDraft(e.target.value)} maxLength={500} rows={3} placeholder="输入企业全称，或追问当前企业的具体记录…" onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();void send(e)}}}/><div><small>{draft.length}/500 · Enter 发送，Shift+Enter 换行</small><button type="submit" disabled={!draft.trim()||busy}>发送问题 ↗</button></div></form>
    </div>
  </section>;
}
