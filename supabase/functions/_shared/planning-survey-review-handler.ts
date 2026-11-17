/** Logged-in management boundary, separate from the session-free collector. */
export type ReviewDependencies = {
  enabled: boolean;
  headers: (request: Request) => Record<string,string>;
  authorize: (request: Request, options: { featureKey: 'eos.configurations.manage'; minLevel: 'full'; headers: Record<string,string> }) => Promise<{ ok: true; user: { id: string } } | { ok: false; response: Response }>;
  act: (campaignId: string, actorId: string, action: 'review'|'close') => Promise<unknown>;
};
export function createPlanningReviewHandler(deps: ReviewDependencies) {
  return async (req: Request): Promise<Response> => {
    const headers={...deps.headers(req),'Content-Type':'application/json','Cache-Control':'no-store','Referrer-Policy':'no-referrer'};
    const reply=(status:number,value:object)=>new Response(JSON.stringify(value),{status,headers});
    if (!deps.enabled) return reply(503,{error:'Review unavailable.'});
    if (req.method==='OPTIONS') return new Response(null,{status:204,headers});
    if (req.method!=='POST' || new URL(req.url).search || !req.headers.get('content-type')?.startsWith('application/json')) return reply(400,{error:'Request not accepted.'});
    try {
      // Resolve identity/permission anew on every request. Never accept actor in body.
      const caller=await deps.authorize(req,{featureKey:'eos.configurations.manage',minLevel:'full',headers});
      if (!caller.ok) return caller.response;
      if (!caller.user.id) return reply(403,{error:'Review unavailable.'});
      const reader=req.body?.getReader(); if (!reader) return reply(400,{error:'Request not accepted.'});
      const chunks:Uint8Array[]=[];let size=0;
      try { while(true) {const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>1000){await reader.cancel();throw new Error('Invalid');}chunks.push(value);} }
      finally {reader.releaseLock();}
      const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
      const body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
      if (!body || typeof body!=='object' || Array.isArray(body) || Object.keys(body).length!==2
        || !Object.keys(body).every(k=>['campaignId','action'].includes(k))
        || typeof body.campaignId!=='string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.campaignId)
        || !['review','close'].includes(body.action)) return reply(400,{error:'Request not accepted.'});
      const data=await deps.act(body.campaignId,caller.user.id,body.action);
      if (!data || typeof data!=='object') return reply(403,{error:'Review unavailable.'});
      return reply(200,data);
    } catch {return reply(400,{error:'Request not accepted.'});} // Never log payloads/errors.
  };
}
