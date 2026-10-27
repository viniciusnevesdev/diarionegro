// Test-only local handlers: no real API key or outbound requests.
let handler: (req: Request) => Promise<Response>;
const serve = Deno.serve;
Deno.serve = ((fn: typeof handler) => { handler = fn; return {} as Deno.HttpServer; }) as typeof Deno.serve;
Deno.env.set('OPENAI_API_KEY', 'fake-key');
Deno.env.set('DN_MEMORY_CONTEXT_ENABLED', 'false');
Deno.env.set('DN_HISTORICAL_REANALYSIS_ENABLED', 'false');
let calls = 0;
let prompt = '';
const originalFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  calls++;
  if (String(input) !== 'https://api.openai.com/v1/responses') throw new Error('Unexpected network access');
  prompt = String(init?.body);
  return Promise.resolve(Response.json({output_text: '{"resumo":"fixture"}'}));
};
await import('../supabase/functions/copiloto/index.ts');
Deno.test('rollback: context disabled ignores client rules and makes no DB call', async () => {
  const response = await handler(new Request('http://localhost', {method:'POST',body:JSON.stringify({modo:'interpretar',texto:'fixture',regras:['FORGED']})}));
  if(response.status !== 200 || calls !== 1 || prompt.includes('FORGED')) throw new Error('Context rollback failed');
});
Deno.test('rollback: historical fallback disabled makes no provider call', async () => {
  const previous = calls;
  const response = await handler(new Request('http://localhost', {method:'POST',body:'{"modo":"reanalisar_historico","texto":"fixture"}'}));
  if(response.status !== 500 || calls !== previous) throw new Error('Historical fallback rollback failed');
});
Deno.test('rollback: dedicated historical reanalysis disabled', async () => {
  await import('../supabase/functions/reanalisar-historico/index.ts');
  const previous = calls;
  const response = await handler(new Request('http://localhost', {method:'POST',body:'{"texto":"fixture"}'}));
  if(response.status !== 500 || calls !== previous) throw new Error('Dedicated rollback failed');
  globalThis.fetch = originalFetch; Deno.serve = serve;
});
