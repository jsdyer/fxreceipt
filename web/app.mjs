import {bankHistory, seriesFor} from './boc.mjs';
import {transaction, rateURL, referenceFromAPI, manualReference, compare, importReceipt, money, csv} from './model.mjs';
const $ = id => document.getElementById(id);
const localToday = () => {const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
let config, receipt = null, controller = null, revision = 0;
const rateText = n => new Intl.NumberFormat('en-CA',{maximumSignificantDigits:10}).format(n);
function status(text,error=false){$('status').textContent=text;$('status').classList.toggle('error',error);}
function rawInput(){return {date:$('date').value,base:$('base').value,quote:$('quote').value,amount:$('amount').value,charged:$('charged').value,note:$('note').value};}
function resetResult(){receipt=null;$('empty-result').hidden=false;$('result').hidden=true;$('receipt-tag').textContent='READY WHEN YOU ARE';}
function invalidate(){revision++;controller?.abort();$('calculate').disabled=false;resetResult();status('Inputs changed. Compare again to update your receipt.');}
function showMode(){const manual=$('mode').value==='manual';$('manual-fields').hidden=!manual;$('api-fields').hidden=$('mode').value!=='api';for(const id of ['manual-rate','manual-date','manual-source'])$(id).required=manual;$('rate-direction').textContent=`Enter ${$('quote').value.toUpperCase() || 'charge currency'} per 1 ${$('base').value.toUpperCase() || 'purchase currency'}.`;}
function render(r,imported=false){
 receipt=r;const t=r.transaction,c=r.calculation,ref=r.reference;
 $('empty-result').hidden=true;$('result').hidden=false;$('receipt-tag').textContent=imported?'SAVED RECEIPT':ref.kind==='manual'?'MANUAL REFERENCE':'DATED REFERENCE';
 $('result-pair').textContent=`${t.base} / ${t.quote} · ${t.date}`;
 const sign=c.difference>0?'+':c.difference<0?'−':'';
 $('difference').textContent=sign+money(Math.abs(c.difference),t.quote);
 const description=Math.abs(c.spreadPercent)<0.0000001?'Matches the reference amount.':`${Math.abs(c.spreadPercent).toFixed(2)}% ${c.difference>0?'above':'below'} the reference amount.`;
 $('difference-note').textContent=description;
 $('bar-reference-label').textContent=money(c.referenceAmount,t.quote);$('bar-actual-label').textContent=money(t.charged,t.quote);
 const max=Math.max(c.referenceAmount,t.charged);$('bar-reference').style.width=`${c.referenceAmount/max*100}%`;$('bar-actual').style.width=`${t.charged/max*100}%`;
 $('r-purchase').textContent=money(t.amount,t.base);$('r-charge').textContent=money(t.charged,t.quote);$('r-effective').textContent=rateText(c.effectiveRate);$('r-rate').textContent=rateText(ref.rate);$('r-direction').textContent=`${t.quote} per 1 ${t.base}`;$('r-date').textContent=ref.date;$('r-percent').textContent=`${c.spreadPercent>0?'+':''}${c.spreadPercent.toFixed(2)}%`;
 $('date-note').textContent=ref.date!==t.date?`Your comparison date is ${t.date}; this reference is dated ${ref.date}. No later rate was substituted.`:ref.kind==='api'&&!ref.provider?`The blend's value date is ${ref.date}. Its provider observations can be earlier; expand them below.`:`Reference and comparison dates both read ${ref.date}.`;
 $('r-note').textContent=t.note?`Your note: ${t.note}`:'';$('r-note').hidden=!t.note;
 $('r-source').textContent=ref.label;$('source-link').hidden=!ref.url;if(ref.url)$('source-link').href=ref.url;
 $('r-retrieved').textContent=ref.retrievedAt?`Retrieved ${ref.retrievedAt.replace('T',' ').replace('Z',' UTC')}`:'Entered by you; not independently fetched or verified.';
 $('observation-rows').replaceChildren();$('observations').hidden=!ref.observations.length;
 $('observation-summary').textContent=`${ref.observations.length} provider observations`;
 for(const o of ref.observations){const tr=document.createElement('tr');for(const value of [o.key,o.date,rateText(o.rate),o.excluded?'Excluded':'Yes']){const td=document.createElement('td');td.textContent=value;tr.append(td);}$('observation-rows').append(tr);}
 status(imported?'Saved receipt opened locally. Values were recalculated from the saved inputs and reference.':'Comparison ready. Save a receipt to keep this rate and its source date.');
}
async function fetchJSON(url,signal){
 const response=await fetch(url,{signal,headers:{Accept:'application/json'},referrerPolicy:'no-referrer'});
 if(!response.ok){let message='';try{message=(await response.json()).message||'';}catch{}throw new Error(`Rate service returned ${response.status}${message?`: ${message}`:'.'} Try another provider, pair or date, or use a manual reference.`);}
 return response.json();
}
async function calculate(event){
 event.preventDefault();controller?.abort();controller=new AbortController();const current=++revision;resetResult();
 try{
 const input=transaction(rawInput(),localToday());let reference;
 if($('mode').value==='manual')reference=manualReference(input,{rate:$('manual-rate').value,date:$('manual-date').value,label:$('manual-source').value});
 else if ($('mode').value === 'boc') {
   const history = await bankHistory(input.date, AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]));
   if (current !== revision) return;
   const last = seriesFor(history.rows, input.base, input.quote, input.date).at(-1);
   const observation = {base:input.base, quote:input.quote, rate:last.rate, date:last.date};
   reference = referenceFromAPI([observation], input, {
     provider:'boc-valet', label:history.retained ? 'Bank of Canada · saved observations' : 'Bank of Canada · daily observations',
     url:history.source, retrievedAt:history.retrievedAt
   });
 } else{
 if(!config)throw new Error('Configuration could not load. Reload the page or use a manual reference.');
 const provider=$('provider').value,url=rateURL(config,input,provider);$('calculate').disabled=true;status('Looking up the reference rate. Your amounts stay in this tab…');
 const timer=setTimeout(()=>controller?.abort(),20000);
 let payload;try{payload=await fetchJSON(url,controller.signal);}finally{clearTimeout(timer);}
 if(current!==revision)return;
 reference=referenceFromAPI(payload,input,{provider,label:config.providers.find(p=>p.key===provider)?.name||provider,url,retrievedAt:new Date().toISOString()});
 }
 if(current===revision)render(compare(input,reference));
 }catch(error){if(current!==revision)return;status(error.name==='AbortError'?'The rate lookup timed out. Try again or enter a manual reference.':error.message,true);}
 finally{if(current===revision)$('calculate').disabled=false;}
}
function download(text,type,extension){const a=document.createElement('a'),url=URL.createObjectURL(new Blob([text],{type}));a.href=url;a.download=`fxreceipt-${receipt.transaction.date}-${receipt.transaction.base}-${receipt.transaction.quote}.${extension}`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('form').addEventListener('submit',calculate);
$('form').addEventListener('input',()=>{invalidate();showMode();});
$('mode').addEventListener('change',showMode);
$('clear').addEventListener('click',()=>{invalidate();$('form').reset();$('date').value=localToday();$('manual-date').value=localToday();if(config){$('base').value=config.defaultPurchaseCurrency;$('quote').value=config.defaultSettlementCurrency;$('provider').value=config.defaultProvider;}$('import').value='';showMode();status('Your amounts and note stay in this tab.');$('amount').focus();});
$('save-json').addEventListener('click',()=>{if(receipt)download(JSON.stringify(receipt,null,2)+'\n','application/json','json');});
$('save-csv').addEventListener('click',()=>{if(receipt)download(csv(receipt),'text/csv;charset=utf-8','csv');});
$('import').addEventListener('change',async()=>{const file=$('import').files[0];if(!file)return;invalidate();const current=revision;try{if(file.size>1000000)throw new Error('Receipt files must be smaller than 1 MB.');const r=importReceipt(JSON.parse(await file.text()),localToday());if(current!==revision)return;for(const [id,value]of Object.entries({date:r.transaction.date,base:r.transaction.base,quote:r.transaction.quote,amount:r.transaction.amount,charged:r.transaction.charged,note:r.transaction.note}))$(id).value=value;
 // Imported evidence stays visible without requesting its source; compare again uses the chosen mode.
 if(r.reference.kind==='manual'){$('mode').value='manual';$('manual-rate').value=r.reference.rate;$('manual-date').value=r.reference.date;$('manual-source').value=r.reference.label;}else{$('mode').value=r.reference.provider==='boc-valet'?'boc':'api';if([...$('provider').options].some(o=>o.value===r.reference.provider))$('provider').value=r.reference.provider;}
 showMode();render(r,true);
 }catch(error){status(`Could not open this receipt: ${error.message}`,true);}finally{$('import').value='';}});
$('date').value=localToday();$('date').max=localToday();$('manual-date').value=localToday();$('manual-date').max=localToday();showMode();
async function start(){try{
 const response=await fetch(new URL('./config.json', import.meta.url));if(!response.ok)throw new Error('Configuration unavailable.');config=await response.json();
 if(!Array.isArray(config.providers)||!config.providers.length)throw new Error('Add at least one rate source in config.json.');
 $('provider').replaceChildren();for(const p of config.providers){if(typeof p.key!=='string'||typeof p.name!=='string')throw new Error('Invalid provider configuration.');const option=document.createElement('option');option.value=p.key;option.textContent=p.name;$('provider').append(option);}
 if ($('mode').value === 'api') { $('base').value=config.defaultPurchaseCurrency; $('quote').value=config.defaultSettlementCurrency; }
 $('provider').value=config.defaultProvider;showMode();
 const catalogURL=new URL('currencies?scope=all',config.apiBase.endsWith('/')?config.apiBase:`${config.apiBase}/`).href;
 const catalog=await fetchJSON(catalogURL,AbortSignal.timeout(15000));
 if(!Array.isArray(catalog))throw new Error('Currency suggestions unavailable.');
 const suggestions=catalog.filter(x=>/^[A-Z]{3}$/.test(x.iso_code)&&(!config.currencyTypes?.length||config.currencyTypes.includes(x.type))).sort((a,b)=>a.iso_code.localeCompare(b.iso_code));
 $('currencies').replaceChildren();for(const row of suggestions){const option=document.createElement('option');option.value=row.iso_code;option.label=`${row.name}${row.end_date?' · coverage varies by date':''}`;$('currencies').append(option);}
 $('currency-status').textContent=`${suggestions.length} current and historical currency suggestions. Type any three-letter code; coverage depends on your date and source.`;
 }catch(error){$('currency-status').textContent='Currency suggestions unavailable. Type a three-letter currency code; rate lookups or manual comparisons still work.';if(!config)status(error.message,true);}}
start();
