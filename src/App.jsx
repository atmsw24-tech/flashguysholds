import React, { useEffect, useMemo, useRef, useState } from "react";
import { fetchGMGNTokens } from "./marketData";
import { startLiveFeeds, subscribeLiveToken } from "./liveFeeds";
import AccountPanel from "./AccountPanel";
import "./styles.css";

const MAX_VISIBLE_TOKENS = 50;
const MAX_STORED_TOKENS = 1500;

function formatNumber(value) {
  const number = Number(value || 0);

  if (number >= 1_000_000_000) {
    return `$${(number / 1_000_000_000).toFixed(2)}B`;
  }

  if (number >= 1_000_000) {
    return `$${(number / 1_000_000).toFixed(2)}M`;
  }

  if (number >= 1_000) {
    return `$${(number / 1_000).toFixed(1)}K`;
  }

  return `$${number.toFixed(0)}`;
}

function formatPrice(value) {
  const number = Number(value || 0);

  if (number === 0) return "$0";

  if (number < 0.000001) {
    return `$${number.toExponential(2)}`;
  }

  if (number < 0.01) {
    return `$${number.toFixed(6)}`;
  }

  if (number < 1) {
    return `$${number.toFixed(4)}`;
  }

  return `$${number.toFixed(2)}`;
}

function formatAge(createdAt) {
  const time = Number(createdAt || Date.now());
  const minutes = Math.max(
    0,
    Math.floor((Date.now() - time) / 60000)
  );

  if (minutes < 60) {
    return `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return `${hours}h`;
  }

  return `${Math.floor(hours / 24)}d`;
}

function TokenLogo({ token }) {
  const [failedUrls, setFailedUrls] = useState([]);
  const raw = token.logo || token.image || token.imageUrl || token.image_uri || token.imageUri || "";
  const value = typeof raw === "string" ? raw.trim() : "";
  const ipfsPath = value.startsWith("ipfs://ipfs/") ? value.slice(12) : value.startsWith("ipfs://") ? value.slice(7) : "";
  const candidates = ipfsPath
    ? ["https://cloudflare-ipfs.com/ipfs/" + ipfsPath, "https://ipfs.io/ipfs/" + ipfsPath, "https://dweb.link/ipfs/" + ipfsPath]
    : (value ? [value] : []);
  const logoUrl = candidates.find((url) => !failedUrls.includes(url));

  useEffect(() => {
    setFailedUrls([]);
  }, [token.address, token.mint, token.logo, token.image, token.imageUrl, token.image_uri, token.imageUri]);

  if (logoUrl) {
    return (
      <div className="token-logo">
        <img
          src={logoUrl}
          alt={token.symbol || token.name || "Token"}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailedUrls((previous) => previous.includes(logoUrl) ? previous : [...previous, logoUrl])}
        />
      </div>
    );
  }

  const letter = (token.symbol || token.name || "?").charAt(0).toUpperCase();
  return <div className="token-logo">{letter}</div>;
}

function TokenSparkline({ token }) {
  const history = Array.isArray(token.priceHistory)
    ? token.priceHistory.map((point) => Number(point.price)).filter((price) => Number.isFinite(price) && price > 0).slice(-24)
    : [];
  if (history.length < 2) {
    const price = Number(token.price || 0);
    if (price > 0) {
      return (
        <svg className="token-sparkline" viewBox="0 0 96 30" role="img" aria-label={`Latest observed price for ${token.symbol || "token"}; waiting for another price update`}>
          <circle cx="48" cy="15" r="4" fill="#55d88a" />
        </svg>
      );
    }
    return <span className="sparkline-empty" title="Waiting for real price data">Waiting…</span>;
  }
  const width = 96;
  const height = 30;
  const pad = 2;
  const min = Math.min(...history);
  const max = Math.max(...history);
  const range = max - min || Math.max(max * 0.001, 1e-12);
  const points = history.map((price, index) => {
    const x = pad + (index / Math.max(1, history.length - 1)) * (width - pad * 2);
    const y = height - pad - ((price - min) / range) * (height - pad * 2);
    return `${x},${y}`;
  }).join(" ");
  const rising = history[history.length - 1] >= history[0];
  return (
    <svg className="token-sparkline" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Recent ${token.symbol || "token"} price movement`}>
      <polyline points={points} fill="none" stroke={rising ? "#55d88a" : "#ff6f7d"} strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function TokenRow({ token, onClick, watched, onToggleWatch }) {
  const change = Number(token.change24h || 0);
  const [copiedCA, setCopiedCA] = useState(false);
  const contractAddress = String(token.address || token.mint || "").trim();

  async function copyContractAddress(event) {
    event.stopPropagation();
    if (!contractAddress) return;
    try {
      await navigator.clipboard.writeText(contractAddress);
      setCopiedCA(true);
      window.setTimeout(() => setCopiedCA(false), 1500);
    } catch (error) {
      // Keep the address visible so it can still be selected and copied manually.
      setCopiedCA(false);
    }
  }

  return (
    <tr
      className="token-row"
      onClick={() => onClick(token)}
      style={{ cursor: "pointer" }}
    >
      <td>
        <div className="token-name">
          <TokenLogo token={token} />

          <div className="token-name-details">
            <div className="token-title-line">
              <strong>{token.name || "Unknown Token"}</strong>
              <span className="token-inline-mcap">{Number(token.marketCap) > 0 ? formatNumber(token.marketCap) : "MCAP N/A"}</span>
            </div>
            <div className="token-symbol">${token.symbol || "UNKNOWN"}</div>
          </div>
        </div>
      </td>

      <td>
        <span className="chain-badge">
          {token.chain === "robinhood"
            ? "Robinhood"
            : "Solana"}
        </span>
      </td>

      <td>
        {contractAddress ? (
          <div className="contract-address-cell" title={contractAddress} style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 190, flexWrap: "wrap" }}>
            <span style={{ color: "#9ca3af", fontSize: 10, fontWeight: 800, letterSpacing: "0.09em", textTransform: "uppercase" }}>CA</span>
            <code style={{ display: "inline-block", maxWidth: 112, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", padding: "6px 9px", borderRadius: 8, background: "rgba(168,85,247,0.08)", border: "1px solid rgba(168,85,247,0.24)", color: "#c084fc", fontSize: 11, fontWeight: 700, letterSpacing: "0.025em" }}>{`${contractAddress.slice(0, 6)}…${contractAddress.slice(-6)}`}</code>
            <button type="button" className="copy-ca-button" onClick={copyContractAddress} aria-label={`Copy full contract address for ${token.symbol || token.name || "token"}`} title="Copy full contract address" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5, whiteSpace: "nowrap", border: copiedCA ? "1px solid rgba(34,197,94,0.45)" : "1px solid rgba(168,85,247,0.32)", background: copiedCA ? "rgba(34,197,94,0.12)" : "rgba(168,85,247,0.1)", color: copiedCA ? "#86efac" : "#c084fc", borderRadius: 8, padding: "6px 9px", fontSize: 11, fontWeight: 700, cursor: "pointer", transition: "all 150ms ease" }}>
              {copiedCA ? "✓ Copied" : "⧉ Copy CA"}
            </button>
          </div>
        ) : <span className="sparkline-empty">Pending…</span>}
      </td>

      <td>{formatPrice(token.price)}</td>

      <td className="sparkline-cell"><TokenSparkline token={token} /></td>

      <td>{formatNumber(token.liquidity)}</td>

      <td>{formatNumber(token.volume1h)}</td>

      <td title={token.holderSource || "Indexed holder data is not available for this token"}>{Number.isFinite(Number(token.holders)) && token.holders !== null && token.holders !== undefined ? Number(token.holders).toLocaleString() : "Unavailable"}</td>

      <td
        style={{
          color: change >= 0 ? "#55d88a" : "#ff6f7d",
          fontWeight: 700
        }}
      >
        {change >= 0 ? "+" : ""}
        {change.toFixed(1)}%
      </td>

      <td>{formatAge(token.createdAt)}</td>
      <td><button type="button" className={watched ? "watch-token is-watched" : "watch-token"} onClick={(event) => { event.stopPropagation(); onToggleWatch(token); }}>{watched ? "★ Saved" : "☆ Watch"}</button></td>
    </tr>
  );
}

function PriceChart({ token }) {
  const [history,setHistory]=useState(()=>Array.isArray(token?.priceHistory)?token.priceHistory.map(point=>{const rawTime=Number(point.time);const time=rawTime>0&&rawTime<1e12?rawTime*1000:rawTime;const close=Number(point.close??point.price);const open=Number(point.open??point.price??close);return {time,open,high:Number(point.high??Math.max(open,close)),low:Number(point.low??Math.min(open,close)),close,price:close,volume:Number(point.volume??0),sampled:true};}).filter(point=>point.time>0&&point.close>0&&Number.isFinite(point.close)).slice(-60):[]);
  const [chartError,setChartError]=useState("");
  const [chartLoading,setChartLoading]=useState(true);
  const [livePrice,setLivePrice]=useState(Number(token?.price||0));
  const [marketCap,setMarketCap]=useState(Number(token?.marketCap||0));
  const [updatedAt,setUpdatedAt]=useState(null);
  const [liveConnected,setLiveConnected]=useState(false);
  const [timeframe,setTimeframe]=useState("5m");
  const [hovered,setHovered]=useState(null);
  const [showVolume,setShowVolume]=useState(true);
  const [chartType,setChartType]=useState("candles");
  const timeframes=[{label:"1m",value:"1m"},{label:"5m",value:"5m"},{label:"15m",value:"15m"},{label:"1H",value:"1h"},{label:"4H",value:"4h"},{label:"1D",value:"1d"}];

  useEffect(()=>{
    let cancelled=false,inFlight=false;
    const address=token?.address||token?.mint;
    const chain=token?.chain==="robinhood"?"robinhood":"sol";
    if(!address){setHistory([]);setChartLoading(false);setChartError("Token contract address is missing.");return undefined;}
    const handleUpdate=event=>{
      const update=event?.detail;
      if(String(update?.mint||update?.address||"").toLowerCase()!==String(address).toLowerCase())return;
      const value=Number(update?.price);
      if(!(value>0))return;
      const time=Number(update.timestamp)>0?(Number(update.timestamp)<1e12?Number(update.timestamp)*1000:Number(update.timestamp)):Date.now();
      setLivePrice(value);setLiveConnected(true);setUpdatedAt(new Date());
      setHistory(previous=>{
        const last=previous[previous.length-1];
        if(last&&time-last.time<1000)return [...previous.slice(0,-1),{...last,high:Math.max(last.high,value),low:Math.min(last.low,value),close:value,price:value}];
        return [...previous,{time,open:last?.close??value,high:Math.max(last?.close??value,value),low:Math.min(last?.close??value,value),close:value,price:value,volume:0,sampled:true}].slice(-240);
      });
    };
    if(chain==="sol")window.addEventListener("flashguys:solana-update",handleUpdate);
    async function load(){
      if(inFlight)return;inFlight=true;
      try{
        const response=await fetch(`/api/chart?address=${encodeURIComponent(address)}&chain=${chain}&timeframe=${timeframe}&fallbackPrice=${encodeURIComponent(Number(token?.price||livePrice||0))}&pairAddress=${encodeURIComponent(token?.pairAddress||"")}&_=${Date.now()}`,{cache:"no-store",headers:{Accept:"application/json"}});
        const data=await response.json();if(!response.ok)throw new Error(data.error||"Market data unavailable");if(cancelled)return;
        const price=Number(data.price);if(price>0)setLivePrice(price);
        const fetchedMarketCap=Number(data.marketCap||data.fdv||token?.marketCap||0);if(fetchedMarketCap>0)setMarketCap(fetchedMarketCap);
        const points=Array.isArray(data.history)?data.history.map(p=>{const rawTime=Number(p.time);const time=rawTime>0&&rawTime<1e12?rawTime*1000:rawTime;const close=Number(p.close??p.price);const open=Number(p.open??close);return {time,open,high:Number(p.high??Math.max(open,close)),low:Number(p.low??Math.min(open,close)),close,price:close,volume:Number(p.volume??0)};}).filter(p=>p.time>0&&Number.isFinite(p.time)&&p.close>0&&Number.isFinite(p.close)&&Number.isFinite(p.open)&&Number.isFinite(p.high)&&Number.isFinite(p.low)).sort((a,b)=>a.time-b.time):[];
        setHistory(previous=>{
          const priorSamples=previous.filter(p=>p.sampled||p.observed);
          const now=Date.now();
          const lastSample=priorSamples[priorSamples.length-1];
          const nextPrice=price>0?price:Number(token?.price||0);
          const nextSample=nextPrice>0&&(!lastSample||now-lastSample.time>=4000)?{
            time:now,open:lastSample?.close??nextPrice,
            high:Math.max(lastSample?.close??nextPrice,nextPrice),
            low:Math.min(lastSample?.close??nextPrice,nextPrice),
            close:nextPrice,price:nextPrice,volume:0,sampled:true
          }:null;
          const samples=nextSample?[...priorSamples,nextSample].slice(-240):priorSamples.slice(-240);
          if(points.length){
            return [...points,...samples.filter(sample=>sample.time>=(points[points.length-1]?.time||0))]
              .sort((a,b)=>a.time-b.time).slice(-120);
          }
          return samples.slice(-120);
        });
        setUpdatedAt(new Date());setChartError(data.historyWarning||"");
      }catch(error){
        if(!cancelled){
          // A market-history API failure must not leave the chart blank when the
          // token feed already has a verified latest price.
          const fallbackPrice=Number(token?.price||livePrice||0);
          if(fallbackPrice>0){
            setLivePrice(fallbackPrice);
            setHistory(previous=>{
              const prior=previous.filter(point=>point.sampled);
              const now=Date.now();
              const last=prior[prior.length-1];
              if(last&&now-last.time<5000)return prior;
              const sample={time:now,open:last?.close??fallbackPrice,high:Math.max(last?.close??fallbackPrice,fallbackPrice),low:Math.min(last?.close??fallbackPrice,fallbackPrice),close:fallbackPrice,price:fallbackPrice,volume:0,sampled:true};
              return [...prior,sample].slice(-60);
            });
            setChartError("Historical candles unavailable; displaying observed token-feed prices.");
          }else{
            setChartError(error?.message||"No market price is available for this token yet.");
          }
        }
      }
      finally{inFlight=false;if(!cancelled)setChartLoading(false);}
    }
    async function loadLiveQuote(){
      if(inFlight||cancelled)return;
      inFlight=true;
      try{
        const response=await fetch(`/api/chart?liveOnly=1&address=${encodeURIComponent(address)}&chain=${chain}&fallbackPrice=${encodeURIComponent(Number(token?.price||livePrice||0))}&_=${Date.now()}`,{cache:"no-store",headers:{Accept:"application/json"}});
        const data=await response.json();
        if(!response.ok)throw new Error(data.error||"Live quote unavailable");
        if(cancelled)return;
        const value=Number(data.price);
        if(value>0){
          setLivePrice(value);
          const stamp=Date.now();
          setHistory(previous=>{
            const last=previous[previous.length-1];
            if(last&&stamp-last.time<950)return [...previous.slice(0,-1),{...last,high:Math.max(Number(last.high||last.close),value),low:Math.min(Number(last.low||last.close),value),close:value,price:value}];
            return [...previous,{time:stamp,open:Number(last?.close||value),high:Math.max(Number(last?.close||value),value),low:Math.min(Number(last?.close||value),value),close:value,price:value,volume:0,sampled:true}].slice(-240);
          });
          const cap=Number(data.marketCap||data.fdv||0);if(cap>0)setMarketCap(cap);
          setUpdatedAt(new Date());setLiveConnected(true);
        }
      }catch(error){
        // Keep the last verified quote visible; a missed one-second poll is not a zero price.
      }finally{inFlight=false;}
    }
    setChartLoading(true);load();
    const refresh=setInterval(loadLiveQuote,1000);
    return()=>{cancelled=true;clearInterval(refresh);if(chain==="sol")window.removeEventListener("flashguys:solana-update",handleUpdate)};
  },[token?.address,token?.mint,token?.chain,timeframe]);

  const candles=history.filter(p=>Number(p.close??p.price)>0&&Number.isFinite(Number(p.time))).sort((a,b)=>a.time-b.time).slice(-60);
  const width=920,height=390,left=16,right=86,top=22,bottom=42,volumeHeight=showVolume?68:0,gap=showVolume?12:0;
  const plotW=width-left-right,plotH=height-top-bottom-volumeHeight-gap;
  const current=Number(livePrice||token?.price||0);
  // Historical candles stay in the original price units returned by the API.
  // Today's implied supply cannot produce trustworthy historical market caps.
  const currentMcap=Number(marketCap||token?.marketCap||0);
  const chartCandles=candles;
  const displayCurrent=current;
  const lows=chartCandles.map(p=>Number(p.low??p.close)).filter(Number.isFinite),highs=chartCandles.map(p=>Number(p.high??p.close)).filter(Number.isFinite);
  // Include the latest quote in the scale; otherwise a fast move can put the live
  // line/current-price marker outside the historical candle range and make the chart look broken.
  if(displayCurrent>0){lows.push(displayCurrent);highs.push(displayCurrent);}
  let minPrice=lows.length?Math.min(...lows):current*.99,maxPrice=highs.length?Math.max(...highs):current*1.01;
  if(maxPrice<=minPrice){const pad=Math.max(Math.abs(maxPrice)*.015,1e-12);minPrice-=pad;maxPrice+=pad;}
  const pad=(maxPrice-minPrice)*.10;minPrice=Math.max(0,minPrice-pad);maxPrice+=pad;
  const range=maxPrice-minPrice||1e-12,y=v=>top+((maxPrice-v)/range)*plotH,step=plotW/Math.max(candles.length,1);
  const candleWidth=Math.max(3,Math.min(10,step*.62));
  const priceFmt=v=>v>=1e9?"$"+(v/1e9).toFixed(2)+"B":v>=1e6?"$"+(v/1e6).toFixed(2)+"M":v>=1e3?"$"+(v/1e3).toFixed(2)+"K":v>0&&v<.0001?"$"+v.toExponential(2):"$"+v.toLocaleString(undefined,{maximumFractionDigits:2});
  const volumes=candles.map(p=>Math.max(0,Number(p.volume||0))),maxVolume=Math.max(...volumes,1);
  const xLabels=chartCandles.length?[chartCandles[0],chartCandles[Math.floor((chartCandles.length-1)/2)],chartCandles[chartCandles.length-1]]:[];
  const change=chartCandles.length>1&&chartCandles[0].close?((chartCandles[chartCandles.length-1].close-chartCandles[0].close)/chartCandles[0].close)*100:null;
  const active=hovered||chartCandles[chartCandles.length-1];
  return <div className="gmgn-chart-shell refined-chart">
    <div className="refined-chart-top">
      <div className="refined-price-block"><div className="refined-symbol-line"><span className="refined-symbol">{token?.symbol||"TOKEN"}</span><span className="refined-pair">/ MARKET CAP</span><span className={liveConnected?"refined-live-dot":"refined-live-dot muted"}>{liveConnected?"LIVE":"MARKET DATA"}</span></div><div className="refined-price-line"><strong>{currentMcap>0?priceFmt(currentMcap):"MCAP N/A"}</strong>{change!==null?<span className={change>=0?"refined-change up":"refined-change down"}>{change>=0?"+":""}{change.toFixed(2)}%</span>:null}</div><div className="refined-updated">{updatedAt?"Updated "+updatedAt.toLocaleTimeString():"Waiting for market data"}</div></div>
      <div className="refined-chart-controls"><div className="gmgn-timeframes" role="group" aria-label="Chart timeframe">{timeframes.map(tf=><button key={tf.value} type="button" className={timeframe===tf.value?"active":""} onClick={()=>setTimeframe(tf.value)}>{tf.label}</button>)}</div><div className="refined-chart-mode" role="group" aria-label="Chart style"><button type="button" className={chartType==="candles"?"active":""} onClick={()=>setChartType("candles")}>Candles</button><button type="button" className={chartType==="line"?"active":""} onClick={()=>setChartType("line")}>Line</button></div><button type="button" className={showVolume?"refined-volume-toggle active":"refined-volume-toggle"} onClick={()=>setShowVolume(v=>!v)}>{showVolume?"Volume on":"Volume off"}</button></div>
    </div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(112px,1fr))",gap:8,margin:"12px 0",padding:"10px 12px",border:"1px solid rgba(168,85,247,.18)",borderRadius:10,background:"rgba(168,85,247,.055)"}}>
      {[["MARKET CAP",currentMcap>0?priceFmt(currentMcap):"Unavailable"],["PRICE",current>0?priceFmt(current):"Unavailable"],["LIQUIDITY",Number(token?.liquidity)>0?priceFmt(Number(token.liquidity)):"Unavailable"],["24H VOLUME",Number(token?.volume24h)>0?priceFmt(Number(token.volume24h)):"Unavailable"],["24H CHANGE",token?.change24h!==undefined&&token?.change24h!==null&&Number.isFinite(Number(token.change24h))?(Number(token.change24h)>=0?"+":"")+Number(token.change24h).toFixed(2)+"%":"Unavailable"],["HOLDERS",Number(token?.holders??token?.holderCount)>0?Number(token.holders??token.holderCount).toLocaleString():"Unavailable"],["BUYS / SELLS",token?.buys24h!=null&&token?.sells24h!=null?Number(token.buys24h).toLocaleString()+" / "+Number(token.sells24h).toLocaleString():"Unavailable"]].map(([label,value])=><div key={label} style={{minWidth:0}}><div style={{fontSize:9,letterSpacing:".09em",color:"#9299a8",marginBottom:5}}>{label}</div><div style={{fontSize:12,fontWeight:700,color:"#f3efff",overflowWrap:"anywhere"}}>{value}</div></div>)}
    </div>
    <div className="refined-ohlc-strip">{active?<><span><i>O</i>{priceFmt(active.open??active.close)}</span><span><i>H</i>{priceFmt(active.high??active.close)}</span><span><i>L</i>{priceFmt(active.low??active.close)}</span><span><i>C</i>{priceFmt(active.close??active.price)}</span></>:<span>OHLC values are original price candles returned by the market-data source</span>}</div>
    {chartCandles.length>=1?<div className="gmgn-candle-chart refined-candle-chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Price chart for ${token?.symbol||"token"}, ${timeframe} timeframe`} preserveAspectRatio="none" style={{width:"100%",minWidth:"760px",height:"auto",display:"block"}}>
        <defs><linearGradient id="refinedChartGlow" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#35d49a" stopOpacity=".13"/><stop offset="100%" stopColor="#35d49a" stopOpacity="0"/></linearGradient></defs>
        {[0,1,2,3,4].map(i=>{const yy=top+plotH*i/4,val=maxPrice-range*i/4;return <g key={i}><line x1={left} x2={width-right+3} y1={yy} y2={yy} stroke="#202936" strokeWidth="1"/><text x={width-right+10} y={yy+4} fill="#8490a0" fontSize="11">{priceFmt(val)}</text></g>})}
        {chartType==="line" ? <><defs><linearGradient id="flashLineFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#a855f7" stopOpacity=".25"/><stop offset="100%" stopColor="#a855f7" stopOpacity="0"/></linearGradient></defs><path d={`M ${chartCandles.map((c,i)=>`${left+i*step+step/2} ${y(Number(c.close??c.price))}`).join(" L ")} L ${left+(chartCandles.length-1)*step+step/2} ${top+plotH} L ${left+step/2} ${top+plotH} Z`} fill="url(#flashLineFill)"/><polyline points={chartCandles.map((c,i)=>`${left+i*step+step/2},${y(Number(c.close??c.price))}`).join(" ")} fill="none" stroke="#b875ff" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke"/>{chartCandles.length===1?<circle cx={left+step/2} cy={y(Number(chartCandles[0].close??chartCandles[0].price))} r="4" fill="#b875ff" stroke="#f3e8ff" strokeWidth="1.5"/>:null}</> : chartCandles.map((c,i)=>{const open=Number(c.open??c.close),close=Number(c.close??c.price),high=Number(c.high??Math.max(open,close)),low=Number(c.low??Math.min(open,close)),xx=left+i*step+step/2,up=close>=open,color=up?"#35d49a":"#f06b7b",bodyY=Math.min(y(open),y(close)),bodyH=Math.max(1.5,Math.abs(y(open)-y(close)));return <g key={c.time+"-"+i} onMouseEnter={()=>setHovered(c)} onMouseLeave={()=>setHovered(null)}><rect x={xx-step/2} y={top} width={step} height={plotH+(showVolume?gap+volumeHeight:0)} fill="transparent"/><line x1={xx} x2={xx} y1={y(high)} y2={y(low)} stroke={color} strokeWidth="1.15"/><rect x={xx-candleWidth/2} y={bodyY} width={candleWidth} height={bodyH} rx=".7" fill={color}/></g>})}
        {displayCurrent>0?<g><line x1={left} x2={width-right+4} y1={y(displayCurrent)} y2={y(displayCurrent)} stroke="#a855f7" strokeWidth="1" strokeDasharray="4 4" opacity=".8"/><rect x={width-right+5} y={Math.max(top,Math.min(top+plotH-15,y(displayCurrent)-7))} width={right-8} height="17" rx="3" fill="#a855f7"/><text x={width-right+9} y={Math.max(top+11,Math.min(top+plotH-4,y(displayCurrent)+4))} fill="#11160a" fontSize="10" fontWeight="700">{priceFmt(displayCurrent)}</text></g>:null}
        {showVolume&&chartCandles.map((c,i)=>{const v=Math.max(0,Number(c.volume||0)),barH=(v/maxVolume)*(volumeHeight-8),xx=left+i*step+step/2,up=Number(c.close??c.price)>=Number(c.open??c.close);return <rect key={"v"+c.time} x={xx-candleWidth/2} y={top+plotH+gap+volumeHeight-barH} width={candleWidth} height={barH} rx=".5" fill={up?"#35d49a":"#f06b7b"} opacity=".48"/>})}
        {showVolume?<text x={left} y={top+plotH+gap+12} fill="#748091" fontSize="10">VOLUME</text>:null}
        {xLabels.map((c,i)=><text key={i} x={left+chartCandles.findIndex(p=>p.time===c.time)*step+step/2} y={height-12} textAnchor={i===0?"start":i===2?"end":"middle"} fill="#8490a0" fontSize="11">{new Date(c.time).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</text>)}
      </svg>
      {hovered?<div className="gmgn-candle-tooltip refined-tooltip"><strong>{new Date(hovered.time).toLocaleString()}</strong><span>O {priceFmt(hovered.open??hovered.close)}</span><span>H {priceFmt(hovered.high??hovered.close)}</span><span>L {priceFmt(hovered.low??hovered.close)}</span><span>C {priceFmt(hovered.close??hovered.price)}</span></div>:null}
    </div>:<div className="gmgn-chart-placeholder refined-chart-placeholder"><div className="refined-placeholder-icon">⌁</div><strong>{chartLoading?"Loading market candles…":"Waiting for candle history"}</strong><span>{displayCurrent>0?"Latest market cap "+priceFmt(displayCurrent):"Market cap is not available yet."}</span></div>}
    <div className="gmgn-chart-footer"><span>● PRICE candles · {timeframe}</span><span>{chartCandles.filter(c=>!c.sampled).length} historical candles{chartCandles.some(c=>c.sampled)?" · observed price samples":""} {showVolume?"· Volume":" "}</span></div>
    {chartError?<div className="chart-empty">{chartError}</div>:null}
  </div>;
}


function TokenXFeed({ token }) {
  const [posts, setPosts] = useState([]);
  const [status, setStatus] = useState("loading");
  const [message, setMessage] = useState("");
  const address = String(token?.address || token?.mint || "").trim();
  const symbol = String(token?.symbol || "").trim();
  const name = String(token?.name || "").trim();

  useEffect(() => {
    let cancelled = false;
    let inFlight = false;
    const terms = [];
    if (symbol) terms.push("$" + symbol);
    if (name && name.toLowerCase() !== symbol.toLowerCase()) terms.push('"' + name.replace(/"/g, "") + '"');
    if (address) terms.push('"' + address + '"');
    if (!terms.length) {
      setStatus("error");
      setMessage("No token name, symbol, or contract address is available for X search.");
      return undefined;
    }
    async function load() {
      if (inFlight) return;
      inFlight = true;
      try {
        const response = await fetch("/api/search?social=1&q=" + encodeURIComponent(terms.join(" OR ")), { cache: "no-store" });
        const data = await response.json();
        if (cancelled) return;
        if (!response.ok || !data.success) throw new Error(data.error || "X posts could not be loaded.");
        setPosts(Array.isArray(data.posts) ? data.posts : []);
        setStatus("ready");
        setMessage("");
      } catch (error) {
        if (!cancelled) { setStatus("error"); setMessage(error?.message || "X posts could not be loaded."); }
      } finally { inFlight = false; }
    }
    setStatus("loading");
    load();
    const interval = window.setInterval(load, 60000);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [address, symbol, name]);

  return <section className="token-x-feed" aria-label="X posts about selected token">
    <div className="token-x-feed-head"><div><span className="token-x-eyebrow">SOCIAL RADAR</span><h3><span className="token-x-mark">𝕏</span> X Feed <span className="token-x-context">for {symbol ? "$" + symbol : name || "this token"}</span></h3></div><span className="token-x-refresh">Auto-refresh · 60s</span></div>
    {status === "loading" ? <p className="token-x-state">Searching recent X posts for this token…</p> : null}
    {status === "error" ? <p className="token-x-state token-x-error">{message}</p> : null}
    {status === "ready" && posts.length === 0 ? <p className="token-x-state">No matching recent public posts found. This does not mean nobody is discussing the token.</p> : null}
    {status === "ready" && posts.length ? <div className="token-x-posts">{posts.map(post => <article className="token-x-post" key={post.id}>
      <div className="token-x-post-meta"><strong>{post.author}</strong>{post.username ? <span>@{post.username}</span> : null}{post.verified ? <span className="token-x-verified">✓</span> : null}<time>{post.createdAt ? new Date(post.createdAt).toLocaleString() : ""}</time></div>
      <p>{post.text}</p>
      <div className="token-x-post-foot"><span>♥ {Number(post.metrics?.like_count || 0).toLocaleString()}</span><span>↻ {Number(post.metrics?.retweet_count || 0).toLocaleString()}</span><span>💬 {Number(post.metrics?.reply_count || 0).toLocaleString()}</span><a href={post.url} target="_blank" rel="noreferrer">View on X ↗</a></div>
    </article>)}</div> : null}
    {status === "error" && message.toLowerCase().includes("not configured") ? <p className="token-x-setup">Add X_BEARER_TOKEN in Vercel Environment Variables using an X API bearer token with recent-search access, then redeploy.</p> : null}
    <p className="token-x-disclaimer">Recent public X search results, not a complete feed. Availability depends on X API access and search indexing.</p>
  </section>;
}

function SolanaBuyPanel({ token }) {
  const [amount, setAmount] = useState("0.01");
  const [side, setSide] = useState("buy");
  const [quote, setQuote] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [walletAddress, setWalletAddress] = useState("");
  const SOL = "So11111111111111111111111111111111111111112";
  const API = "https://lite-api.jup.ag/swap/v1";
  useEffect(() => {
    const read = () => { try { const w = JSON.parse(localStorage.getItem("flashguys.connected.wallet") || "null"); setWalletAddress(w?.chain === "solana" ? w.address || "" : ""); } catch { setWalletAddress(""); } };
    read(); window.addEventListener("storage", read); window.addEventListener("flashguys:wallet", read);
    return () => { window.removeEventListener("storage", read); window.removeEventListener("flashguys:wallet", read); };
  }, []);
  const provider = () => window.phantom?.solana || (window.solana?.isPhantom ? window.solana : null) || window.solflare || window.solana;
  async function getQuote() {
    setError(""); setMessage(""); setQuote(null);
    if (!token.address || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(token.address)) return setError("A valid Solana mint address is required.");
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0 || n > 100) return setError("Enter an amount greater than 0 and no more than 100 SOL.");
    setBusy(true);
    try {
      const inputMint = side === "buy" ? SOL : token.address;
      const outputMint = side === "buy" ? token.address : SOL;
      const inputDecimals = side === "buy" ? 9 : Number(token.decimals ?? 0);
      if (side === "sell" && (!Number.isInteger(inputDecimals) || inputDecimals < 0 || inputDecimals > 18)) throw new Error("Token decimals are unavailable; cannot safely prepare a sell quote.");
      const res = await fetch(`${API}/quote?inputMint=${encodeURIComponent(inputMint)}&outputMint=${encodeURIComponent(outputMint)}&amount=${Math.floor(n * Math.pow(10, inputDecimals))}&slippageBps=100`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.message || "Jupiter quote request failed.");
      if (!data.outAmount || !Array.isArray(data.routePlan) || !data.routePlan.length) throw new Error("Jupiter returned no executable route for this token.");
      setQuote(data); setMessage("Live quote received. No funds have been spent or transaction sent.");
    } catch (e) { setError(e.message || "Could not retrieve a Jupiter quote."); }
    finally { setBusy(false); }
  }
  async function buy() {
    if (!quote) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const p = provider();
      if (!p) throw new Error("Phantom or a compatible Solana wallet is not detected. Install/unlock it and try again.");
      const connected = await p.connect();
      const pubkey = connected?.publicKey || p.publicKey;
      if (!pubkey) throw new Error("Wallet connection was not approved.");
      const address = pubkey.toString(); setWalletAddress(address);
      localStorage.setItem("flashguys.connected.wallet", JSON.stringify({ chain: "solana", address, name: p.isPhantom ? "Phantom" : "Solana wallet" }));
      window.dispatchEvent(new Event("flashguys:wallet"));
      const res = await fetch(`${API}/swap`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ quoteResponse: quote, userPublicKey: address, wrapAndUnwrapSol: true, dynamicComputeUnitLimit: true, prioritizationFeeLamports: "auto" }) });
      const data = await res.json();
      if (!res.ok || !data.swapTransaction) throw new Error(data.error || data.message || "Jupiter did not provide a swap transaction.");
      const { VersionedTransaction } = await import("@solana/web3.js");
      const tx = VersionedTransaction.deserialize(Uint8Array.from(atob(data.swapTransaction), ch => ch.charCodeAt(0)));
      const signed = await p.signTransaction(tx);
      const serialized = signed.serialize(); let binary = "";
      for (let i = 0; i < serialized.length; i += 0x8000) binary += String.fromCharCode(...serialized.subarray(i, i + 0x8000));
      const rpc = await fetch("https://api.mainnet-beta.solana.com", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "sendTransaction", params: [btoa(binary), { encoding: "base64", maxRetries: 3, preflightCommitment: "confirmed" }] }) });
      const result = await rpc.json();
      if (!rpc.ok || result.error) throw new Error(result.error?.message || "Solana RPC rejected the transaction.");
      setMessage(`Transaction submitted: ${result.result}. Check Solscan for confirmation.`); setQuote(null);
    } catch (e) { setError(e.message || "Swap failed or was cancelled."); }
    finally { setBusy(false); }
  }
  const out = quote && token.decimals != null ? (Number(quote.outAmount) / Math.pow(10, side === "buy" ? Number(token.decimals) : 9)).toLocaleString("en-US", { maximumFractionDigits: 6 }) : null;
  return <section className="sol-buy-card">
    <div className="sol-buy-topline"><span className="sol-buy-live"><i /> IN-APP SWAP</span><span className="sol-buy-network">SOLANA MAINNET</span></div>
    <div style={{display:"flex",gap:8,marginBottom:12}}><button type="button" className={side==="buy"?"sol-buy-cta":"refined-volume-toggle"} onClick={()=>{setSide("buy");setQuote(null);}}>Buy</button><button type="button" className={side==="sell"?"sol-buy-cta":"refined-volume-toggle"} onClick={()=>{setSide("sell");setQuote(null);}}>Sell</button></div><div className="sol-buy-heading"><div className="sol-buy-coin-icon">ϟ</div><div><h3>Buy {token.symbol || "token"}</h3><p>Swap SOL for {token.symbol || "this token"}</p></div><span className="sol-buy-provider">JUP<span>ITER</span></span></div>
    <div className="sol-buy-input-label"><label htmlFor="fg-buy-sol">YOU PAY</label><span>{side === "buy" ? "Native asset · SOL" : "Token · " + (token.symbol || "TOKEN")}</span></div>
    <div className="sol-buy-amount-box"><input id="fg-buy-sol" type="number" min="0.000001" max="100" step="0.001" value={amount} onChange={e => { setAmount(e.target.value); setQuote(null); }} /><strong>{side === "buy" ? "SOL" : (token.symbol || "TOKEN")}</strong></div>
    <div className="sol-buy-receive"><span>YOU RECEIVE</span><strong>{quote ? (out ? out : Number(quote.outAmount).toLocaleString("en-US")) : "—"} <small>{side === "buy" ? (token.symbol || "TOKEN") : "SOL"}</small></strong></div>
    {quote ? <div className="sol-buy-details"><div><span>Price impact</span><strong>{quote.priceImpactPct != null ? `${Number(quote.priceImpactPct).toFixed(3)}%` : "Not supplied"}</strong></div><div><span>Route hops</span><strong>{quote.routePlan.length}</strong></div><div><span>Slippage</span><strong>1.00%</strong></div></div> : <p className="sol-buy-note">Get a live Jupiter quote before swapping. Your wallet will show the transaction details and ask for approval. Quote requests never spend funds.</p>}
    <button type="button" className="sol-buy-cta" onClick={quote ? buy : getQuote} disabled={busy}>{busy ? "Preparing swap…" : quote ? `Confirm ${side} in Phantom` : `Get ${side} quote`} <span>→</span></button>
    {message ? <p className="sol-buy-feedback" role="status">{message}</p> : null}
    {error ? <p className="sol-buy-feedback is-error" role="alert">{error}</p> : null}
    <div className="sol-buy-footer"><span className="sol-buy-wallet-dot" /><span>{walletAddress ? `${walletAddress.slice(0, 6)}…${walletAddress.slice(-5)}` : "Wallet connects when you request a quote"}</span><span className="sol-buy-secure">WALLET-APPROVED</span></div>
  </section>;
}

function RobinhoodBuyPanel({ token }) {
  const [amount, setAmount] = useState("0.01");
  const [side, setSide] = useState("buy");
  const [quote, setQuote] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [wallet, setWallet] = useState("");
  const CHAIN = "0x1237";
  const ETH = "0x0000000000000000000000000000000000000000";
  const request = async (action, payload) => {
    const res = await fetch("/api/robinhood-swap", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...payload }) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Robinhood swap service failed.");
    return data;
  };
  useEffect(() => {
    try { const w = JSON.parse(localStorage.getItem("flashguys.connected.wallet") || "null"); if (w?.chain === "evm") setWallet(w.address || ""); } catch {}
  }, []);
  async function getQuote() {
    setError(""); setMessage(""); setQuote(null);
    if (!token.address || !/^0x[a-fA-F0-9]{40}$/.test(token.address)) return setError("A valid Robinhood Chain token contract address is required.");
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0 || n > 100) return setError("Enter an amount greater than 0 and no more than 100 ETH.");
    setBusy(true);
    try {
      const provider = window.ethereum;
      if (!provider?.request) throw new Error("Connect Robinhood Wallet, MetaMask, or another EVM wallet first.");
      const accounts = await provider.request({ method: "eth_requestAccounts" });
      if (!accounts?.[0]) throw new Error("Wallet connection was not approved.");
      let chainId = String(await provider.request({ method: "eth_chainId" })).toLowerCase();
      if (chainId !== CHAIN) {
        try { await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: CHAIN }] }); }
        catch (e) {
          if (e?.code !== 4902) throw e;
          await provider.request({ method: "wallet_addEthereumChain", params: [{ chainId: CHAIN, chainName: "Robinhood Chain", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: ["https://rpc.mainnet.chain.robinhood.com"], blockExplorerUrls: ["https://robinhoodchain.blockscout.com"] }] });
          await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: CHAIN }] });
        }
      }
      chainId = String(await provider.request({ method: "eth_chainId" })).toLowerCase();
      if (chainId !== CHAIN) throw new Error("Switch your wallet to Robinhood Chain (4663).");
      const address = accounts[0]; setWallet(address);
      const w = { chain: "evm", walletName: "EVM wallet", address, chainId: CHAIN, connectedAt: new Date().toISOString() };
      localStorage.setItem("flashguys.connected.wallet", JSON.stringify(w)); window.dispatchEvent(new Event("flashguys:wallet"));
      const decimals = side === "buy" ? 18 : Number(token.decimals);
      if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18) throw new Error("Token decimals are unavailable; cannot safely prepare a sell quote.");
      const [whole, fraction = ""] = amount.trim().split(".");
      const baseAmount = (BigInt(whole || "0") * 10n ** BigInt(decimals) + BigInt((fraction + "0".repeat(decimals)).slice(0, decimals) || "0")).toString();
      const data = await request("quote", { tokenIn: side === "buy" ? ETH : token.address, tokenOut: side === "buy" ? token.address : ETH, amount: baseAmount, swapper: address });
      if (!data.quote) throw new Error(data.error || "No Uniswap route returned for this token.");
      if (["DUTCH_V2", "DUTCH_V3", "PRIORITY"].includes(data.routing)) throw new Error("This quote requires UniswapX order signing, which is not enabled in this version. Try another route or token.");
      setQuote(data); setMessage("Quote simulated by Uniswap. No transaction has been sent.");
    } catch (e) { setError(e.message || "Could not get a Robinhood Chain quote."); }
    finally { setBusy(false); }
  }
  async function buy() {
    if (!quote) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const provider = window.ethereum;
      const accounts = await provider.request({ method: "eth_requestAccounts" });
      const address = accounts?.[0];
      if (!address) throw new Error("Connect your EVM wallet first.");
      if (String(await provider.request({ method: "eth_chainId" })).toLowerCase() !== CHAIN) throw new Error("Select Robinhood Chain (4663) in your wallet before buying.");
      const swapData = await request("swap", { quote: quote.quote });
      const tx = swapData.swap || swapData.swapTransaction;
      if (!tx?.to || !tx?.data) throw new Error("Uniswap did not return executable transaction data.");
      const txHash = await provider.request({ method: "eth_sendTransaction", params: [{ from: address, to: tx.to, data: tx.data, value: tx.value || "0x0", ...(tx.gasLimit ? { gas: tx.gasLimit } : {}), ...(tx.maxFeePerGas ? { maxFeePerGas: tx.maxFeePerGas } : {}), ...(tx.maxPriorityFeePerGas ? { maxPriorityFeePerGas: tx.maxPriorityFeePerGas } : {}), ...(tx.gasPrice ? { gasPrice: tx.gasPrice } : {}) }] });
      setMessage(`Transaction submitted: ${txHash}. Track confirmation in Robinhood Chain Explorer.`); setQuote(null);
    } catch (e) { setError(e.message || "Swap failed or was cancelled."); }
    finally { setBusy(false); }
  }
  const output = quote?.quote?.output?.amount || quote?.quote?.output?.amountOut || "";
  return <section className="rh-buy-card">
    <div className="rh-buy-topline"><span className="rh-buy-live"><i /> IN-APP SWAP</span><span className="rh-buy-network">ROBINHOOD CHAIN</span></div>
    <div style={{display:"flex",gap:8,marginBottom:12}}><button type="button" className={side==="buy"?"rh-buy-cta":"refined-volume-toggle"} onClick={()=>{setSide("buy");setQuote(null);}}>Buy</button><button type="button" className={side==="sell"?"rh-buy-cta":"refined-volume-toggle"} onClick={()=>{setSide("sell");setQuote(null);}}>Sell</button></div><div className="rh-buy-heading"><div className="rh-buy-coin-icon">↗</div><div><h3>Buy {token.symbol || "token"}</h3><p>Swap ETH for {token.symbol || "this token"}</p></div><span className="rh-buy-provider">UNI<span>SWAP</span></span></div>
    <div className="rh-buy-input-label"><label htmlFor="fg-rh-buy-eth">YOU PAY</label><span>{side === "buy" ? "Native asset · ETH" : "Token · " + (token.symbol || "TOKEN")}</span></div>
    <div className="rh-buy-amount-box"><input id="fg-rh-buy-eth" type="number" min="0.000001" max="100" step="0.001" value={amount} onChange={e => { setAmount(e.target.value); setQuote(null); }} /><strong>{side === "buy" ? "ETH" : (token.symbol || "TOKEN")}</strong></div>
    <div className="rh-buy-receive"><span>YOU RECEIVE</span><strong>{quote ? (output ? Number(output).toLocaleString("en-US") : "See quote details") : "—"} <small>{side === "buy" ? (token.symbol || "TOKEN") : "ETH"}</small></strong></div>
    {quote ? <div className="rh-buy-details"><div><span>Route</span><strong>{quote.routing || "Uniswap"}</strong></div><div><span>Estimated gas (USD)</span><strong>{quote.quote?.classicGasUseEstimateUSD || "Not supplied"}</strong></div><div><span>Slippage</span><strong>0.5%</strong></div></div> : <p className="rh-buy-note">Get a live quote before swapping. Network fees apply and your wallet will ask you to approve the transaction.</p>}
    <button type="button" className="rh-buy-cta" onClick={quote ? buy : getQuote} disabled={busy}>{busy ? "Preparing swap…" : quote ? `Confirm ${side} in wallet` : `Get ${side} quote`} <span>→</span></button>
    {message ? <p className="rh-buy-feedback" role="status">{message}</p> : null}
    {error ? <p className="rh-buy-feedback is-error" role="alert">{error}</p> : null}
    <div className="rh-buy-footer"><span className="rh-buy-wallet-dot" /><span>{wallet ? `${wallet.slice(0, 6)}…${wallet.slice(-5)}` : "Wallet connects when you request a quote"}</span><span className="rh-buy-secure">WALLET-APPROVED</span></div>
  </section>;
}

function TokenModal({ token, onClose, watched, onToggleWatch }) {
  if (!token) return null;

  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
    >
      <div
        className="modal"
        onClick={(event) =>
          event.stopPropagation()
        }
      >
        <div className="modal-header">
          <div className="modal-title">
            <TokenLogo token={token} />

            <div>
              <h2>
                {token.name || "Unknown Token"}
              </h2>

              <div className="token-symbol">
                ${token.symbol || "UNKNOWN"}
              </div>
            </div>
          </div>

          <div className="modal-header-actions"><button type="button" className={watched ? "watch-token is-watched modal-watch-token" : "watch-token modal-watch-token"} onClick={() => onToggleWatch?.(token)} aria-pressed={Boolean(watched)}>{watched ? "★ Starred" : "☆ Star coin"}</button>
          <button
            className="close-button"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button></div>
        </div>

        <div className="modal-body">
          <div className="stats-grid">
            <div className="stat">
              <div className="stat-label">
                Price
              </div>

              <div className="stat-value">
                {formatPrice(token.price)}
              </div>
            </div>

            <div className="stat">
              <div className="stat-label">
                Market Cap
              </div>

              <div className="stat-value">
                {formatNumber(token.marketCap)}
              </div>
            </div>

            <div className="stat">
              <div className="stat-label">
                Liquidity
              </div>

              <div className="stat-value">
                {formatNumber(token.liquidity)}
              </div>
            </div>

            <div className="stat">
              <div className="stat-label">Indexed Holders</div>
              <div className="stat-value" title={token.holderSource || "Indexed holder data is not available for this token"}>{token.holders !== null && token.holders !== undefined ? Number(token.holders).toLocaleString() : "Unavailable"}</div>
            </div>

            <div className="stat">
              <div className="stat-label">24h Volume</div>
              <div className="stat-value">{formatNumber(token.volume24h)}</div>
            </div>
            <div className="stat">
              <div className="stat-label">1h Volume</div>
              <div className="stat-value">{formatNumber(token.volume1h)}</div>
            </div>
            <div className="stat">
              <div className="stat-label">Fully Diluted Value</div>
              <div className="stat-value">{formatNumber(token.fdv)}</div>
            </div>
            <div className="stat">
              <div className="stat-label">24h Buys / Sells</div>
              <div className="stat-value">{Number(token.buys24h || 0).toLocaleString()} / {Number(token.sells24h || 0).toLocaleString()}</div>
            </div>
          </div>

          {token.chain === "robinhood" ? <RobinhoodBuyPanel token={token} /> : <SolanaBuyPanel token={token} />}\n\n          <div className="chart-container">
            <div className="chart-title">Price Chart</div>
            <PriceChart token={token} />
          </div>

          <section className="token-activity-panel" aria-label="Token activity and holder details">
            <div className="token-activity-heading">
              <div>
                <div className="chart-title">ON-CHAIN INTELLIGENCE</div>
                <h3>Token Activity</h3>
              </div>
              <span className="token-activity-chain">{token.chain === "robinhood" ? "ROBINHOOD CHAIN" : "SOLANA"}</span>
            </div>

            <div className="token-activity-grid">
              <div className="token-activity-stat">
                <span>Indexed holders</span>
                <strong>{token.holders !== null && token.holders !== undefined && Number.isFinite(Number(token.holders)) ? Number(token.holders).toLocaleString() : "Unavailable"}</strong>
                <small>{token.holderSource || "No indexed holder count supplied"}</small>
              </div>
              <div className="token-activity-stat">
                <span>Buys · last 5m</span>
                <strong className="activity-buy">{Number(token.txns5m?.buys ?? token.buys5m ?? 0).toLocaleString()}</strong>
                <small>Reported by market data</small>
              </div>
              <div className="token-activity-stat">
                <span>Sells · last 5m</span>
                <strong className="activity-sell">{Number(token.txns5m?.sells ?? token.sells5m ?? 0).toLocaleString()}</strong>
                <small>Reported by market data</small>
              </div>
              <div className="token-activity-stat">
                <span>24h transactions</span>
                <strong>{(Number(token.txns24h?.buys ?? token.buys24h ?? 0) + Number(token.txns24h?.sells ?? token.sells24h ?? 0)).toLocaleString()}</strong>
                <small>{Number(token.txns24h?.buys ?? token.buys24h ?? 0).toLocaleString()} buys / {Number(token.txns24h?.sells ?? token.sells24h ?? 0).toLocaleString()} sells</small>
              </div>
            </div>

            <div className="token-activity-subpanel">
              <div className="token-activity-subheading">
                <strong>Buy / sell pressure · 24h</strong>
                <span>Source-reported counts</span>
              </div>
              {(() => {
                const buys = Math.max(0, Number(token.txns24h?.buys ?? token.buys24h ?? 0));
                const sells = Math.max(0, Number(token.txns24h?.sells ?? token.sells24h ?? 0));
                const total = buys + sells;
                const buyPercent = total ? (buys / total) * 100 : 0;
                return <>
                  <div className="activity-pressure-track" role="img" aria-label={total ? `${buyPercent.toFixed(1)} percent buys and ${(100 - buyPercent).toFixed(1)} percent sells in the last 24 hours` : "Buy and sell pressure unavailable"}>
                    <span style={{ width: `${buyPercent}%` }} />
                  </div>
                  <div className="activity-pressure-legend">
                    <span className="activity-buy">▲ Buys {total ? `${buyPercent.toFixed(1)}%` : "—"}</span>
                    <span className="activity-sell">▼ Sells {total ? `${(100 - buyPercent).toFixed(1)}%` : "—"}</span>
                  </div>
                  {!total ? <p className="activity-unavailable">Buy/sell counts are not supplied for this token yet. Zero is not treated as proof of no trading.</p> : null}
                </>;
              })()}
            </div>

            <div className="token-activity-subpanel">
              <div className="token-activity-subheading">
                <strong>Holder distribution</strong>
                <span>{Array.isArray(token.topHolders) && token.topHolders.length ? "Indexed wallet data" : "Indexer required"}</span>
              </div>
              {Array.isArray(token.topHolders) && token.topHolders.length ? (
                <div className="top-holder-list">
                  {token.topHolders.slice(0, 5).map((holder, index) => {
                    const share = Number(holder.percentage ?? holder.sharePercent ?? holder.percent);
                    const wallet = String(holder.address || holder.owner || holder.wallet || "");
                    return <div className="top-holder-row" key={wallet || index}>
                      <span>#{index + 1} <code>{wallet ? `${wallet.slice(0, 6)}…${wallet.slice(-5)}` : "Wallet unavailable"}</code></span>
                      <strong>{Number.isFinite(share) ? `${share.toFixed(2)}%` : "Share unavailable"}</strong>
                    </div>;
                  })}
                </div>
              ) : <p className="activity-unavailable">Top-wallet balances and concentration are not provided in the current feed. FLASHGUYS will not estimate holder distribution from holder count alone.</p>}
            </div>

            <div className="token-activity-subpanel">
              <div className="token-activity-subheading">
                <strong>Recent trades</strong>
                <span>Live transaction records</span>
              </div>
              {Array.isArray(token.recentTrades) && token.recentTrades.length ? (
                <div className="recent-trades-list">
                  {token.recentTrades.slice(0, 8).map((trade, index) => <div className="recent-trade-row" key={trade.signature || trade.hash || trade.id || index}>
                    <span className={String(trade.side || trade.type || "").toLowerCase().includes("sell") ? "activity-sell" : "activity-buy"}>{String(trade.side || trade.type || "TRADE").toUpperCase()}</span>
                    <strong>{trade.amountUsd != null ? formatNumber(trade.amountUsd) : trade.valueUsd != null ? formatNumber(trade.valueUsd) : "Amount unavailable"}</strong>
                    <time>{trade.timestamp || trade.time ? new Date(Number(trade.timestamp || trade.time) < 1e12 ? Number(trade.timestamp || trade.time) * 1000 : Number(trade.timestamp || trade.time)).toLocaleTimeString() : "Time unavailable"}</time>
                    {(trade.signature || trade.hash) ? <a href={token.chain === "robinhood" ? `https://robinhoodchain.blockscout.com/tx/${trade.hash || trade.signature}` : `https://solscan.io/tx/${trade.signature || trade.hash}`} target="_blank" rel="noreferrer">View ↗</a> : null}
                  </div>)}
                </div>
              ) : <p className="activity-unavailable">Individual trade records are not included in the current token-feed response. Summary buy/sell counts above are shown only when reported by the market-data source.</p>}
            </div>
          </section>

          <TokenXFeed token={token} />

          <section className="token-extra-details" style={{ marginTop: 18 }}>
            <h3>Token Details</h3>
            <p><strong>Contract / Mint address:</strong> <code style={{ overflowWrap: "anywhere" }}>{token.address || token.mint || "Unavailable"}</code></p>
            <p><strong>Network:</strong> {token.chain === "robinhood" ? "Robinhood Chain" : "Solana"}</p>
            <p><strong>Launch source:</strong> {token.protocol || token.dexId || "Unavailable"}</p>
            <p><strong>Creator wallet:</strong> <code style={{ overflowWrap: "anywhere" }}>{token.creator || "Unavailable from source"}</code></p>
            <p><strong>Total supply:</strong> {Number(token.supply) > 0 ? Number(token.supply).toLocaleString() : "Unavailable from source"}</p>
            <p><strong>Token decimals:</strong> {Number(token.decimals) > 0 ? token.decimals : "Unavailable from source"}</p>
            <p><strong>Launch time:</strong> {token.createdAt ? new Date(Number(token.createdAt) < 1e12 ? Number(token.createdAt) * 1000 : Number(token.createdAt)).toLocaleString() : "Unavailable"}</p>
            <p><strong>Pair created:</strong> {token.pairCreatedAt ? new Date(Number(token.pairCreatedAt)).toLocaleString() : "Not paired yet / unavailable"}</p>
            <p><strong>Bonding curve graduated:</strong> {typeof token.graduated === "boolean" ? (token.graduated ? "Yes" : "No") : "Unavailable"}</p>
            <p><strong>Description:</strong> {token.description || "Not provided by token metadata"}</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 10 }}>
              {(token.address && token.chain !== "robinhood" ? [{ type: "Pump.fun page", url: `https://pump.fun/coin/${encodeURIComponent(token.address)}` }, { type: "Solscan", url: `https://solscan.io/token/${encodeURIComponent(token.address)}` }] : []).concat(token.pairUrl ? [{ type: "Trading pair", url: token.pairUrl }] : [], token.website ? [{ type: "Website", url: token.website }] : [], token.twitter ? [{ type: "X / Twitter", url: token.twitter.startsWith("http") ? token.twitter : `https://x.com/${token.twitter.replace(/^@/, "")}` }] : [], token.telegram ? [{ type: "Telegram", url: token.telegram.startsWith("http") ? token.telegram : `https://t.me/${token.telegram.replace(/^@/, "")}` }] : [], Array.isArray(token.socials) ? token.socials : []).map((link, index) => <a key={index} href={link.url} target="_blank" rel="noreferrer">{link.type || "Link"}</a>)}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function HolderRewardsPage() {
  const [competitionTab, setCompetitionTab] = useState("rules");
  const rules = [
    ["1", "Connect your wallet", "Use the wallet that holds the eligible token. Wallet ownership must be verified; connecting alone does not prove holdings."],
    ["2", "Hold eligible tokens", "Each contest publishes eligible tokens, snapshot times, minimum balance, and hold period before it starts."],
    ["3", "Rank by verified holdings", "Leaderboard positions must use indexed on-chain balances and anti-sybil checks, not self-reported balances."],
    ["4", "Share verified creator fees", "A published share of creator fees can be distributed only after the fee source and payout mechanism are integrated and tested."]
  ];
  return (
    <section className="holder-rewards-page">
      <div className="rewards-hero">
        <div className="rewards-kicker">⚡ FLASHGUYS REWARDS ARENA</div>
        <h1>Hold. Compete. <span>Earn a share.</span></h1>
        <p>Holder competitions designed to share eligible creator-fee revenue with qualifying token holders. Rewards are not guaranteed and depend on actual fees, published rules, and on-chain verification.</p>
        <div className="rewards-status-row"><span className="rewards-status-pill">CREATOR FEE SOURCE: NOT CONNECTED</span><span className="rewards-status-pill rewards-status-muted">PAYOUTS: DISABLED</span></div>
      </div>
      <div className="rewards-metric-grid">
        <div className="rewards-metric"><span>Current reward pool</span><strong>Not available</strong><small>Waiting for verified creator-fee data</small></div>
        <div className="rewards-metric"><span>Eligible holders</span><strong>Not indexed</strong><small>Wallet-level holder data is required</small></div>
        <div className="rewards-metric"><span>Competition status</span><strong>Setup required</strong><small>No live contest is accepting entries yet</small></div>
      </div>
      <div className="rewards-panel">
        <div className="rewards-panel-heading"><div><span className="rewards-kicker">LEADERBOARD</span><h2>Top holders</h2></div><span className="rewards-coming-soon">AWAITING ON-CHAIN INDEXER</span></div>
        <div className="rewards-tabs">
          <button className={competitionTab === "rules" ? "active" : ""} onClick={() => setCompetitionTab("rules")}>How it works</button>
          <button className={competitionTab === "eligibility" ? "active" : ""} onClick={() => setCompetitionTab("eligibility")}>Eligibility</button>
          <button className={competitionTab === "payouts" ? "active" : ""} onClick={() => setCompetitionTab("payouts")}>Fee payouts</button>
        </div>
        {competitionTab === "rules" ? <div className="rewards-rules-list">{rules.map(([number, title, description]) => <div className="rewards-rule" key={number}><span>{number}</span><div><strong>{title}</strong><p>{description}</p></div></div>)}</div> : competitionTab === "eligibility" ? <div className="rewards-info-block"><h3>Fair competition rules</h3><ul><li>Only publicly verifiable on-chain balances count.</li><li>Each contest publishes the token contract, snapshot time, minimum qualifying balance, and ranking method.</li><li>Anti-sybil exclusions must follow published rules.</li><li>Never share seed phrases or private keys to participate.</li></ul></div> : <div className="rewards-info-block"><h3>Creator fees and payouts</h3><ul><li>Creator-fee revenue must be verified from a supported protocol or fee wallet.</li><li>The exact holder allocation, operating fees, and payout schedule must be disclosed.</li><li>Distribution remains disabled until the fee source and payout mechanism are integrated and tested on-chain.</li><li>Rewards can be zero if no eligible creator fees are generated.</li></ul></div>}
        <div className="rewards-notice">No earnings, holder rankings, or fee amounts are fabricated. Live competition data will appear after FLASHGUYS connects an indexed holder-balance source and verifies a creator-fee distribution mechanism.</div>
      </div>
    </section>
  );
}

function LaunchPage({ tokens = [] }) {
  const [network, setNetwork] = useState("sol");
  const [tab, setTab] = useState("all");
  const [wallet, setWallet] = useState("");
  const [walletBusy, setWalletBusy] = useState(false);
  const [walletMessage, setWalletMessage] = useState("");
  const [form, setForm] = useState({ name: "", symbol: "", description: "", image: "", website: "", twitter: "", telegram: "", supply: "1000000000" });
  const [showCreate, setShowCreate] = useState(false);
  const isSolana = network === "sol";
  // Only render records with an on-chain contract/mint and real token metadata.
  // Missing market metrics stay explicitly unavailable; they are never replaced with estimates.
  const networkTokens = tokens.filter((token) => {
    const chainMatches = isSolana
      ? ["sol", "solana"].includes(String(token.chain || "").toLowerCase())
      : String(token.chain || "").toLowerCase() === "robinhood";
    const address = String(token.address || token.mint || "");
    const validAddress = isSolana
      ? /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)
      : /^0x[a-fA-F0-9]{40}$/.test(address);
    const validName = token.name && !["unknown", "???", "token"].includes(String(token.name).toLowerCase());
    const validSymbol = token.symbol && !["???", "token"].includes(String(token.symbol).toLowerCase());
    return chainMatches && validAddress && validName && validSymbol;
  });
  const visibleTokens = networkTokens.filter((token) => {
    if (tab === "new") {
      const created = new Date(token.createdAt || token.pairCreatedAt || token.timestamp || "").getTime();
      return Number.isFinite(created) && created > 0 && Date.now() - created < 86400000;
    }
    if (tab === "active") return Number(token.volume24h || token.volume1h || 0) > 0;
    if (tab === "graduated") return Boolean(token.graduated || token.isGraduated);
    return true;
  }).sort((a, b) => Number(b.marketCap || 0) - Number(a.marketCap || 0));

  async function connectWallet() {
    setWalletBusy(true); setWalletMessage("");
    try {
      if (isSolana) {
        const provider = window.phantom?.solana || window.solflare || window.solana;
        if (!provider?.connect) throw new Error("Install Phantom or Solflare to connect a Solana wallet.");
        const response = await provider.connect();
        const address = response?.publicKey?.toString?.() || provider.publicKey?.toString?.() || "";
        if (!address) throw new Error("No Solana wallet address was returned.");
        setWallet(address);
        setWalletMessage("Solana wallet connected. Token deployment is not enabled yet.");
      } else {
        const ethereum = window.ethereum;
        if (!ethereum) throw new Error("Install Robinhood Wallet or MetaMask to connect.");
        await ethereum.request({ method: "wallet_addEthereumChain", params: [{ chainId: "0x1237", chainName: "Robinhood Chain", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: ["https://rpc.mainnet.chain.robinhood.com"], blockExplorerUrls: ["https://robinhoodchain.blockscout.com"] }] });
        await ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x1237" }] });
        const accounts = await ethereum.request({ method: "eth_requestAccounts" });
        const address = accounts?.[0] || "";
        if (!address) throw new Error("No EVM wallet account was returned.");
        setWallet(address);
        setWalletMessage("Wallet connected on Robinhood Chain. Token deployment is not enabled yet.");
      }
    } catch (error) { setWalletMessage(error?.message || "Wallet connection failed."); }
    finally { setWalletBusy(false); }
  }

  const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const formatMcap = (value) => {
    if (value === null || value === undefined || value === "" || !Number.isFinite(Number(value)) || Number(value) <= 0) return "Not reported";
    const n = Number(value);
    if (n >= 1e9) return "$" + (n / 1e9).toFixed(2) + "B";
    if (n >= 1e6) return "$" + (n / 1e6).toFixed(2) + "M";
    if (n >= 1e3) return "$" + (n / 1e3).toFixed(1) + "K";
    return n > 0 ? "$" + n.toFixed(0) : "—";
  };

  return (
    <div className="fb-launchpad">
      <div className="fb-launchpad-hero">
        <div className="fb-launchpad-kicker"><span className="fb-live-pulse" /> MULTI-CHAIN · COMMUNITY LAUNCHES</div>
        <div className="fb-launchpad-hero-row">
          <div><h1>Launch the <span>next movement.</span></h1><p>Create, discover and trade community tokens across Solana and Robinhood Chain—all from FLASHBOYS.</p></div>
          <button className="fb-create-launch" onClick={() => setShowCreate((v) => !v)}>{showCreate ? "Close creator" : "＋ Create a coin"}</button>
        </div>
        <div className="fb-launchpad-stats"><div><small>NETWORK</small><strong>{isSolana ? "Solana" : "Robinhood Chain"}</strong></div><div><small>{isSolana ? "NETWORK" : "CHAIN ID"}</small><strong>{isSolana ? "Mainnet" : "4663"}</strong></div><div><small>LISTED IN FEED</small><strong>{networkTokens.length}</strong></div><div><small>YOUR WALLET</small><strong>{wallet ? wallet.slice(0, 6) + "…" + wallet.slice(-4) : "Not connected"}</strong></div></div>
      </div>
      <div className="fb-launch-toolbar">
        <div><span className="fb-section-eyebrow">CHOOSE YOUR NETWORK</span><h2>Launchpad networks</h2></div>
        <div className="fb-launch-filters"><button className={isSolana ? "active" : ""} onClick={() => { setNetwork("sol"); setWallet(""); setWalletMessage(""); setTab("all"); }}>Solana</button><button className={!isSolana ? "active" : ""} onClick={() => { setNetwork("robinhood"); setWallet(""); setWalletMessage(""); setTab("all"); }}>Robinhood Chain</button></div>
      </div>
      {showCreate ? <section className="fb-create-panel">
        <div className="fb-create-heading"><div><span className="fb-section-eyebrow">TOKEN STUDIO · {isSolana ? "SOLANA" : "ROBINHOOD CHAIN"}</span><h2>Create your coin</h2><p>{isSolana ? "Prepare a Solana SPL token with metadata and a Pump.fun-style bonding-curve launch." : "Prepare your Robinhood Chain token for a bonding-curve launch and liquidity graduation."}</p></div><span className="fb-protocol-status">LAUNCH INTEGRATION IN PROGRESS</span></div>
        <div className="fb-create-grid">
          <label>Token name<input value={form.name} onChange={update("name")} placeholder="e.g. Flash Rocket" maxLength={32}/></label>
          <label>Ticker<input value={form.symbol} onChange={update("symbol")} placeholder="e.g. FROCKET" maxLength={10}/></label>
          <label className="fb-wide">Description<textarea value={form.description} onChange={update("description")} placeholder="What is your coin about?" maxLength={500}/></label>
          <label className="fb-wide">Logo image URL<input value={form.image} onChange={update("image")} placeholder="https://…"/></label>
          <label>Website<input value={form.website} onChange={update("website")} placeholder="https://…"/></label>
          <label>X profile<input value={form.twitter} onChange={update("twitter")} placeholder="https://x.com/…"/></label>
          <label>Telegram<input value={form.telegram} onChange={update("telegram")} placeholder="https://t.me/…"/></label>
          <label>Total supply<input value={form.supply} onChange={update("supply")} inputMode="numeric" placeholder="1000000000"/></label>
        </div>
        <div className="fb-create-actions"><button type="button" className="fb-connect-wallet" onClick={connectWallet} disabled={walletBusy}>{walletBusy ? "Connecting…" : wallet ? "Wallet connected ✓" : isSolana ? "Connect Phantom / Solflare" : "Connect Robinhood Wallet"}</button><button type="button" className="fb-launch-disabled" disabled title="Available after the launch protocol is integrated and tested">Launch coin · Coming soon</button></div>
        {walletMessage ? <p className="fb-wallet-message" role="status">{walletMessage}</p> : null}
        <div className="fb-protocol-note"><strong>Launch status:</strong> Wallet connection is available, but token deployment is not. {isSolana ? "Solana needs a verified Pump program integration, metadata upload, transaction simulation, and mainnet testing." : "Robinhood Chain needs deployed and independently reviewed bonding-curve and graduation contracts."} No token is created and no funds are collected by this form.</div>
      </section> : null}
      <div className="fb-launch-toolbar"><div><span className="fb-section-eyebrow">THE LAUNCH FLOOR</span><h2>Explore {isSolana ? "Solana" : "Robinhood Chain"} launches</h2></div><div className="fb-launch-filters">{[["all","All coins"],["new","New"],["active","Active"],["graduated","Graduated"]].map(([value,label]) => <button key={value} className={tab===value?"active":""} onClick={() => setTab(value)}>{label}</button>)}</div></div>
      {visibleTokens.length ? <div className="fb-launch-grid">{visibleTokens.slice(0,50).map((token) => <article className="fb-launch-token" key={token.address || token.mint}>
        <div className="fb-launch-token-top">{token.image || token.logo ? <img className="fb-launch-token-logo" src={token.image || token.logo} alt="" loading="lazy" /> : <div className="fb-launch-token-logo">◈</div>}<span className={token.graduated || token.isGraduated ? "fb-token-stage graduated" : "fb-token-stage"}>{token.graduated || token.isGraduated ? "GRADUATED" : Number(token.volume24h || token.volume1h || 0) > 0 ? "ACTIVE" : "INDEXED"}</span></div>
        <h3>{token.name || "Unknown token"}</h3><p className="fb-token-ticker">${token.symbol || "TOKEN"}</p>
        <div className="fb-token-metrics"><div><small>MARKET CAP</small><strong>{formatMcap(token.marketCap)}</strong></div><div><small>24H VOLUME</small><strong>{formatMcap(token.volume24h || token.volume1h)}</strong></div></div>
        <div className="fb-token-address">{String(token.address || token.mint || "").slice(0,8)}…{String(token.address || token.mint || "").slice(-6)}</div>
        <a href={isSolana ? "https://solscan.io/token/" + encodeURIComponent(token.address || token.mint) : "https://robinhoodchain.blockscout.com/token/" + encodeURIComponent(token.address)} target="_blank" rel="noreferrer">View on {isSolana ? "Solscan" : "Blockscout"} ↗</a>
      </article>)}</div> : <div className="fb-launch-empty"><div>✦</div><h3>No launches in this filter yet</h3><p>{isSolana ? "Solana tokens discovered by FLASHGUYS will appear here as the live feed indexes them." : "Robinhood Chain tokens discovered by FLASHGUYS will appear here as the market feed indexes them."}</p><button onClick={() => setTab("all")}>View all indexed coins</button></div>}
      <div className="fb-launchpad-footer"><span>FLASHBOYS LAUNCHPAD</span><span>{isSolana ? "Solana Mainnet" : "Robinhood Chain · Chain ID 4663"}</span><a href={isSolana ? "https://solscan.io/" : "https://robinhoodchain.blockscout.com/"} target="_blank" rel="noreferrer">Explorer ↗</a></div>
    </div>
  );
}
export default function App() {
  const [page, setPage] =
    useState("discover");

  const [chain, setChain] =
    useState("all");

  const [tokenView, setTokenView] = useState("new");

  const [tokens, setTokens] =
    useState([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const [search, setSearch] =
    useState("");

  const [remoteSearchTokens, setRemoteSearchTokens] = useState([]);
  const [remoteSearchStatus, setRemoteSearchStatus] = useState("");

  const [selectedToken, setSelectedToken] =
    useState(null);

  const [lastUpdated, setLastUpdated] =
    useState(null);

  const [liveLaunchCount, setLiveLaunchCount] = useState(0);
  const [watchlistOnly, setWatchlistOnly] = useState(false);
  const [watchlist, setWatchlist] = useState(() => { try { return JSON.parse(localStorage.getItem("flashboys.watchlist") || "[]"); } catch { return []; } });
  const seenLiveLaunches = useRef(new Set());

  const [accountOpen, setAccountOpen] = useState(() => {
    try {
      return !localStorage.getItem("flashguys.auth.session");
    } catch {
      return true;
    }
  });

  // Count unique launch events from the live feed during this browser session.
  useEffect(() => {
    const handleNewLaunch = (event) => {
      const mint = String(event?.detail?.mint || "").trim().toLowerCase();
      if (!mint || seenLiveLaunches.current.has(mint)) return;
      seenLiveLaunches.current.add(mint);
      setLiveLaunchCount(seenLiveLaunches.current.size);
    };
    window.addEventListener("flashguys:new-launch", handleNewLaunch);
    return () => window.removeEventListener("flashguys:new-launch", handleNewLaunch);
  }, []);

  // Apply follow-up Pump.fun metadata as soon as the IPFS/metadata gateway responds.
  useEffect(() => {
    const handleTokenMetadata = (event) => {
      const patch = event?.detail;
      const address = String(patch?.address || patch?.mint || "").toLowerCase();
      if (!address) return;
      const applyPatch = (token) => {
        if (String(token.address || token.mint || "").toLowerCase() !== address) return token;
        return {
          ...token,
          ...(patch.image ? { image: patch.image, logo: patch.image } : {}),
          ...(patch.description ? { description: patch.description } : {}),
          ...(patch.website ? { website: patch.website } : {}),
          ...(patch.twitter ? { twitter: patch.twitter } : {}),
          ...(patch.telegram ? { telegram: patch.telegram } : {})
        };
      };
      setTokens((previous) => previous.map(applyPatch));
      setSelectedToken((previous) => previous ? applyPatch(previous) : previous);
    };
    window.addEventListener("flashguys:solana-token", handleTokenMetadata);
    return () => window.removeEventListener("flashguys:solana-token", handleTokenMetadata);
  }, []);

  // Start the real-time Solana socket once for the whole app.
  useEffect(() => {
    const stop = startLiveFeeds({
      onToken: (newToken) => {
        if (!newToken?.address) return;
        setTokens((previous) => {
          const mintKey = String(newToken.address || newToken.mint).toLowerCase();
          const exists = previous.some((item) => String(item.address || item.mint || "").toLowerCase() === mintKey);
          if (exists) return previous.map((item) => {
            if (String(item.address || item.mint || "").toLowerCase() !== mintKey) return item;
            const history = Array.isArray(item.priceHistory) ? [...item.priceHistory] : [];
            const price = Number(newToken.price);
            const timestamp = Number(newToken.timestamp) > 0
              ? (Number(newToken.timestamp) < 1e12 ? Number(newToken.timestamp) * 1000 : Number(newToken.timestamp))
              : Date.now();
            if (price > 0 && (!history.length || Math.abs(Number(history[history.length - 1]?.price) - price) > 0 || timestamp - Number(history[history.length - 1]?.time || 0) >= 5000)) {
              history.push({ time: timestamp, price });
            }
            return { ...item, ...newToken, priceHistory: history.slice(-24) };
          });
          const seeded = { ...newToken, priceHistory: Number(newToken.price) > 0 ? [{ time: Date.now(), price: Number(newToken.price) }] : [] };
          return [seeded, ...previous].slice(0, MAX_STORED_TOKENS);
        });
      },
      onUpdate: (update) => {
        if (!update?.mint) return;
        const applyUpdate = (item) => {
          if (String(item.address || item.mint || "").toLowerCase() !== String(update.mint).toLowerCase()) return item;
          const nextPrice = Number(update.price);
          const previousHistory = Array.isArray(item.priceHistory) ? item.priceHistory : [];
          const nextHistory = nextPrice > 0
            ? [...previousHistory, { time: Number(update.timestamp) > 0 ? Number(update.timestamp) * 1000 : Date.now(), price: nextPrice }].slice(-24)
            : previousHistory;
          return {
            ...item,
            ...(nextPrice > 0 ? { price: nextPrice, priceHistory: nextHistory } : {}),
            ...(Number(update.marketCap) > 0 ? { marketCap: Number(update.marketCap) } : {}),
            ...(Number(update.volume24h) > 0 ? { volume24h: Number(update.volume24h) } : {}),
            ...(Number(update.liquidity) > 0 ? { liquidity: Number(update.liquidity) } : {}),
            ...(Number(update.change24h) ? { change24h: Number(update.change24h) } : {}),
            live: true
          };
        };
        setTokens((previous) => previous.map(applyUpdate));
        setSelectedToken((previous) => previous ? applyUpdate(previous) : previous);
      },
      onStatus: (status) => {
        console.log("FLASHGUYS live feed status:", status);
      },
      onError: (err) => {
        console.warn("FLASHGUYS live feed unavailable:", err?.message || err);
      }
    });
    return () => stop?.();
  }, []);

  const loadingTokensRef = useRef(false);

  async function loadTokens() {
    // Do not let a slow API request overlap the next refresh.
    if (loadingTokensRef.current) return;
    loadingTokensRef.current = true;
    try {
      setLoading(true);
      setError("");

      const data =
        await fetchGMGNTokens(chain);

      // Merge API results with live launches instead of erasing launches
      // received from the socket between polling requests.
      const apiTokens = Array.isArray(data) ? data : [];
      setTokens((previous) => {
        const merged = new Map();
        apiTokens.forEach((token) => {
          const key = String(token.address || token.mint || token.id || "").toLowerCase();
          if (key) merged.set(key, token);
        });
        previous.forEach((token) => {
          const key = String(token.address || token.mint || token.id || "").toLowerCase();
          if (!key) return;
          const current = merged.get(key);
          if (current) {
            const previousHistory = Array.isArray(token.priceHistory) ? token.priceHistory : [];
            const apiHistory = Array.isArray(current.priceHistory) ? current.priceHistory : [];
            const nextHistory = [...previousHistory];
            const observedPrice = Number(current.price);
            const now = Date.now();
            if (observedPrice > 0 && (!nextHistory.length || now - Number(nextHistory[nextHistory.length - 1]?.time || 0) >= 5000)) {
              nextHistory.push({ time: now, price: observedPrice });
            }
            merged.set(key, {
              ...token,
              ...current,
              priceHistory: [...nextHistory, ...apiHistory].sort((x, y) => Number(x.time || 0) - Number(y.time || 0)).slice(-24)
            });
          } else {
            merged.set(key, token);
          }
        });
        return [...merged.values()].sort((a, b) => Number(b.createdAt || b.timestamp || 0) - Number(a.createdAt || a.timestamp || 0)).slice(0, MAX_VISIBLE_TOKENS * 3);
      });

      setLastUpdated(new Date());
    } catch (err) {
      console.error(err);

      // Keep previously loaded and live tokens visible when a refresh fails.
      // A temporary API error must never wipe the existing market list.
      setError(err?.message || "Unable to refresh token data.");
    } finally {
      loadingTokensRef.current = false;
      setLoading(false);
    }
  }

  useEffect(() => {
    if (page === "launch") {
      return;
    }

    loadTokens();

    // WebSocket feeds deliver new launches instantly; REST is only a backup
    // market-data refresh, so polling every 15s is lighter on the browser/API.
    const interval = setInterval(
      loadTokens,
      15000
    );

    return () => clearInterval(interval);
  }, [chain, page]);

  useEffect(() => {
    const query = search.trim();
    if (query.length < 2) {
      setRemoteSearchTokens([]);
      setRemoteSearchStatus("");
      return;
    }

    let cancelled = false;
    setRemoteSearchStatus("Searching live token markets…");
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(query)}&chain=${encodeURIComponent(chain)}`);
        const data = await response.json();
        if (cancelled) return;
        if (!response.ok || !data.success) throw new Error(data.error || "Search unavailable");
        setRemoteSearchTokens(Array.isArray(data.tokens) ? data.tokens : []);
        setRemoteSearchStatus(data.tokens?.length ? `Found ${data.tokens.length} matching live market result(s).` : "No matching live market found.");
      } catch (error) {
        if (cancelled) return;
        setRemoteSearchTokens([]);
        setRemoteSearchStatus("Live search is temporarily unavailable.");
      }
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [search, chain]);

  useEffect(() => { try { localStorage.setItem("flashboys.watchlist", JSON.stringify(watchlist)); } catch { /* storage may be unavailable */ } }, [watchlist]);

  function toggleWatch(token) {
    const address = String(token.address || token.mint || token.id || "").toLowerCase();
    if (!address) return;
    setWatchlist((previous) => previous.some((item) => item.address === address)
      ? previous.filter((item) => item.address !== address)
      : [{ address, name: token.name || "Unknown Token", symbol: token.symbol || "UNKNOWN", chain: token.chain || "solana" }, ...previous].slice(0, 200));
  }

  const filteredTokens = useMemo(() => {
    const query =
      search.trim().toLowerCase();

    const combined = new Map();
    [...tokens, ...remoteSearchTokens].forEach((token) => {
      const key = String(token.address || token.mint || token.id || "").toLowerCase();
      if (key) combined.set(key, { ...combined.get(key), ...token });
    });
    let result = [...combined.values()];

    if (watchlistOnly) { const saved = new Set(watchlist.map((item) => item.address)); result = result.filter((token) => saved.has(String(token.address || token.mint || token.id || "").toLowerCase())); }

    if (chain !== "all") {
      result = result.filter((token) => {
        const tokenChain = String(token.chain || "").toLowerCase();
        if (chain === "sol") return tokenChain === "sol" || tokenChain === "solana";
        return tokenChain === chain;
      });
    }

    if (query) {
      result = result.filter((token) => {
        const name =
          token.name?.toLowerCase() || "";

        const symbol =
          token.symbol?.toLowerCase() || "";

        const address = String(token.address || token.mint || "").toLowerCase();

        return (
          name.includes(query) ||
          symbol.includes(query) ||
          address.includes(query)
        );
      });
    }

    if (tokenView === "top") {
      // Rank daily leaders using reported 24h volume first, then daily change
      // and liquidity as tie-breakers. No artificial scores are displayed.
      result.sort((a, b) =>
        (Number(b.volume24h || 0) - Number(a.volume24h || 0)) ||
        (Number(b.change24h || 0) - Number(a.change24h || 0)) ||
        (Number(b.liquidity || 0) - Number(a.liquidity || 0))
      );
    } else if (tokenView === "trending") {
      // Rank trending tokens using reported short-term activity and momentum.
      result.sort((a, b) =>
        (Number(b.volume1h || 0) - Number(a.volume1h || 0)) ||
        (Number(b.change1h || 0) - Number(a.change1h || 0)) ||
        (Number(b.liquidity || 0) - Number(a.liquidity || 0))
      );
    } else {
      result.sort((a, b) =>
        Number(b.createdAt || b.timestamp || 0) - Number(a.createdAt || a.timestamp || 0)
      );
    }

    return result.slice(
      0,
      MAX_VISIBLE_TOKENS
    );
  }, [tokens, remoteSearchTokens, chain, search, tokenView, watchlistOnly, watchlist]);

  return (
    <div className="app">
      <header className="header">
        <button
          className="logo"
          onClick={() =>
            setPage("discover")
          }
          style={{
            border: 0,
            background: "transparent",
            color: "inherit",
            cursor: "pointer"
          }}
        >
          <span className="logo-mark" aria-label="FLASHGUYS logo">
            <img
              src="/favicon.svg"
              alt="FLASHGUYS"
              style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
            />
          </span>

          <span className="header-brand-text">FLASHBOYS</span>
        </button>

        <nav className="nav">
          <button
            className={
              page === "discover"
                ? "active"
                : ""
            }
            onClick={() =>
              setPage("discover")
            }
          >
            Discover
          </button>

          <button
            className={page === "trending" ? "active" : ""}
            onClick={() => { setPage("trending"); setTokenView("trending"); }}
          >
            Trending
          </button>

          <button className={watchlistOnly ? "active" : ""} onClick={() => { setPage("discover"); setWatchlistOnly((value) => !value); }}>
            {watchlistOnly ? "Watchlist ✓" : "Watchlist"}
          </button>

          <button className={page === "rewards" ? "active" : ""} onClick={() => setPage("rewards")}>Holder Rewards</button>

          <button
            className={
              page === "launch"
                ? "active"
                : ""
            }
            onClick={() =>
              setPage("launch")
            }
          >
            Launchpad
          </button>
        </nav>
        <button type="button" className="flashboys-launch-cta" onClick={() => setPage("launch")} aria-label="Open FLASHBOYS token launch options"><span className="flashboys-launch-bolt" aria-hidden="true">⚡</span><span>Launch FLASHBOYS</span></button>
        <button className="account-open-button" onClick={() => setAccountOpen(true)}>
          <span className="account-open-icon" aria-hidden="true">↗</span><span className="account-open-label">Account / Connect Wallet</span>
        </button>
      </header>

      <main className="main">
        {page === "launch" ? (
          <LaunchPage tokens={tokens} />
        ) : page === "rewards" ? (
          <HolderRewardsPage />
        ) : (
          <>
            <section className="hero">
              <h1>
                {page === "trending"
                  ? <>Track the <span>trend</span> before the crowd.</>
                  : <>FLASHGUYS × <span>FLASHBOYS</span></>}
              </h1>

              {page === "trending" ? (
                <p>Trending tokens ranked by reported short-term volume, momentum, and liquidity.</p>
              ) : (
                <>
                  <p className="hero-tagline">In 2014, there were Flash Guys. Now, it’s time for FLASHBOYS. ⚡</p>
                  <p className="hero-description">
                    A new generation moves faster. FLASHBOYS is the launch culture inside FLASHGUYS—built for people who spot what’s next before the crowd. Discover emerging tokens across Solana and Robinhood Chain, track live market data, and find your next move.
                  </p>
                </>
              )}
            </section>

            <section className="flash-pulse-grid" aria-label="FLASHBOYS tools">
              <div className="pulse-card launch-radar-card" role="button" tabIndex={0} onClick={() => { setPage("discover"); setWatchlistOnly(false); setTokenView("new"); }} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setPage("discover"); setWatchlistOnly(false); setTokenView("new"); } }}>
                <div className="pulse-card-top"><span className="pulse-icon">⚡</span><span className="pulse-live"><i /> LIVE RADAR</span></div>
                <strong>{tokens.filter((token) => Number(token.createdAt || token.timestamp) > Date.now() - 3600000).length}</strong>
                <h3>Launch Radar</h3><p>Tokens timestamped within the last hour in your current feed.</p><span className="pulse-card-link">View new tokens <span aria-hidden="true">→</span></span>
              </div>
              <div className="pulse-card" role="button" tabIndex={0} onClick={() => { setPage("trending"); setWatchlistOnly(false); setTokenView("trending"); }} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setPage("trending"); setWatchlistOnly(false); setTokenView("trending"); } }}>
                <div className="pulse-card-top"><span className="pulse-icon">◈</span><span className="pulse-tag">TRANSPARENCY</span></div>
                <strong>{tokens.filter((token) => Number(token.liquidity) > 0 && Number(token.marketCap) > 0).length}</strong>
                <h3>FlashScore Data</h3><p>Tokens with reported liquidity and market cap. This is data coverage, not a safety score.</p><span className="pulse-card-link">Explore trending <span aria-hidden="true">→</span></span>
              </div>
              <div className="pulse-card" role="button" tabIndex={0} onClick={() => { setPage("discover"); setWatchlistOnly(true); }} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setPage("discover"); setWatchlistOnly(true); } }}>
                <div className="pulse-card-top"><span className="pulse-icon">☆</span><span className="pulse-tag">YOUR LIST</span></div>
                <strong>{watchlist.length}</strong><h3>FlashAlerts</h3><p>Save tokens on this device. Automated price alerts are not active yet.</p>
                <span className="pulse-card-link">Open Watchlist <span aria-hidden="true">→</span></span>
              </div>
            </section>

            <section className="controls">
              <div className="chain-tabs" aria-label="Token view">
                <button className={tokenView === "new" ? "active" : ""} onClick={() => { setTokenView("new"); setPage("discover"); }}>New Tokens</button>
                <button className={tokenView === "top" ? "active" : ""} onClick={() => { setTokenView("top"); setPage("discover"); }}>Daily Top Tokens</button>
                <button className={tokenView === "trending" ? "active" : ""} onClick={() => { setTokenView("trending"); setPage("trending"); }}>Trending</button>
              </div>
              <div className="chain-tabs" aria-label="Blockchain filter">
                <button
                  className={
                    chain === "all"
                      ? "active"
                      : ""
                  }
                  onClick={() =>
                    setChain("all")
                  }
                >
                  All
                </button>

                <button
                  className={
                    chain === "sol"
                      ? "active"
                      : ""
                  }
                  onClick={() =>
                    setChain("sol")
                  }
                >
                  Solana
                </button>

                <button
                  className={
                    chain === "robinhood"
                      ? "active"
                      : ""
                  }
                  onClick={() =>
                    setChain("robinhood")
                  }
                >
                  Robinhood
                </button>
              </div>

              <input
                className="search"
                type="search"
                placeholder="Search tokens..."
                value={search}
                onChange={(event) =>
                  setSearch(
                    event.target.value
                  )
                }
              />
              {search.trim().length >= 2 && (
                <div className="search-status" role="status">
                  {remoteSearchStatus || "Searching live token markets…"}
                </div>
              )}
            </section>

            {(() => {
              const focusToken = selectedToken || filteredTokens[0];
              const focusAddress = String(focusToken?.address || focusToken?.mint || "");
              return (
                <section className="terminal-layout" aria-label="Live trading terminal">
                  <aside className="terminal-left">
                    <div className="terminal-panel">
                      <div className="terminal-panel-heading"><span>⚡ Live Feed</span><span className="terminal-live"><i /> LIVE DATA</span></div>
                      <div className="terminal-feed-list">
                        {filteredTokens.slice(0, 7).map((item) => (
                          <button type="button" className={focusAddress && String(item.address || item.mint || "") === focusAddress ? "terminal-feed-item selected" : "terminal-feed-item"} key={item.id || item.address || item.mint || item.symbol} onClick={() => setSelectedToken(item)}>
                            <TokenLogo token={item} />
                            <span className="terminal-feed-name"><strong>{item.name || item.symbol || "Unknown token"}</strong><small>${item.symbol || "TOKEN"} · {item.chain === "robinhood" ? "Robinhood Chain" : "Solana"}</small></span>
                            <span className="terminal-feed-price">{formatPrice(item.price)}</span>
                          </button>
                        ))}
                        {filteredTokens.length === 0 ? <div className="terminal-empty">Waiting for live token feed…</div> : null}
                      </div>
                      <button type="button" className="terminal-text-link" onClick={() => { setTokenView("new"); setPage("discover"); }}>View new launches →</button>
                    </div>
                    <div className="terminal-panel terminal-social-panel">
                      <div className="terminal-panel-heading"><span>𝕏 X Tracker</span><span className="terminal-live"><i /> STATUS</span></div>
                      <div className="terminal-social-body">
                        <strong>Token-specific social signals</strong>
                        <p>Open a token to inspect its details. Live X posts appear here when the X API is configured.</p>
                        <div className="terminal-social-status">{focusToken ? `Selected: ${focusToken.name || focusToken.symbol || "Token"}` : "Select a token to begin"}</div>
                        <button type="button" className="terminal-text-link" onClick={() => setAccountOpen(true)}>Connect account / wallet →</button>
                      </div>
                    </div>
                  </aside>
                  <section className="terminal-center">
                    {focusToken ? (
                      <>
                        <div className="terminal-token-heading">
                          <div className="terminal-token-identity"><TokenLogo token={focusToken} /><div><h2>{focusToken.name || "Unknown Token"} <span>{focusToken.chain === "robinhood" ? "Robinhood Chain" : "Solana"}</span></h2><p>${focusToken.symbol || "TOKEN"} · {focusAddress ? `${focusAddress.slice(0, 7)}…${focusAddress.slice(-6)}` : "Contract address unavailable"}</p></div></div>
                          <div className="terminal-head-metrics"><div><small>Price</small><strong>{formatPrice(focusToken.price)}</strong></div><div><small>Market Cap</small><strong>{Number(focusToken.marketCap) > 0 ? formatNumber(focusToken.marketCap) : "N/A"}</strong></div><div><small>Liquidity</small><strong>{Number(focusToken.liquidity) > 0 ? formatNumber(focusToken.liquidity) : "N/A"}</strong></div><div><small>Holders</small><strong>{Number.isFinite(Number(focusToken.holders)) && focusToken.holders != null ? Number(focusToken.holders).toLocaleString() : "Unavailable"}</strong></div></div>
                        </div>
                        <div className="terminal-chart-wrap"><PriceChart key={focusAddress || focusToken.symbol} token={focusToken} /></div>
                      </>
                    ) : <div className="terminal-empty terminal-chart-empty">No token selected. Waiting for live market data.</div>}
                  </section>
                  <aside className="terminal-right">
                    <div className="terminal-panel terminal-metrics-panel">
                      <div className="terminal-panel-heading">Token Overview</div>
                      {focusToken ? <><div className="terminal-score"><span>ϟ</span><div><strong>Market Snapshot</strong><small>Reported data only · not a safety score</small></div></div><div className="terminal-metric-row"><span>Price</span><strong>{formatPrice(focusToken.price)}</strong></div><div className="terminal-metric-row"><span>Market Cap</span><strong>{Number(focusToken.marketCap) > 0 ? formatNumber(focusToken.marketCap) : "N/A"}</strong></div><div className="terminal-metric-row"><span>Liquidity</span><strong>{Number(focusToken.liquidity) > 0 ? formatNumber(focusToken.liquidity) : "N/A"}</strong></div><div className="terminal-metric-row"><span>24h Volume</span><strong>{Number(focusToken.volume24h || focusToken.volume1h) > 0 ? formatNumber(focusToken.volume24h || focusToken.volume1h) : "N/A"}</strong></div><div className="terminal-metric-row"><span>Indexed Holders</span><strong>{Number.isFinite(Number(focusToken.holders)) && focusToken.holders != null ? Number(focusToken.holders).toLocaleString() : "Unavailable"}</strong></div><div className="terminal-contract"><small>Contract Address</small><code title={focusAddress}>{focusAddress || "Unavailable"}</code>{focusAddress ? <button type="button" onClick={() => navigator.clipboard?.writeText(focusAddress).catch(() => {})}>⧉ Copy CA</button> : null}{focusToken.pairUrl ? <a href={focusToken.pairUrl} target="_blank" rel="noreferrer">Open market pair ↗</a> : null}</div></> : <div className="terminal-empty">Token metrics will appear when data loads.</div>}
                    </div>
                  </aside>
                </section>
              );
            })()}
            <section className="token-card">
              {loading && tokens.length === 0 ? (
                <div className="status">
                  Loading tokens...
                </div>
              ) : error && filteredTokens.length === 0 ? (
                <div className="status error">
                  {error}
                </div>
              ) : filteredTokens.length ===
                0 ? (
                <div className="status">
                  No tokens found.
                </div>
              ) : (
                <table className="token-table">
                  <thead>
                    <tr>
                      <th>Token</th>
                      <th>MCAP</th>
                      <th>Chain</th>
                      <th>Contract Address</th>
                      <th>Price</th>
                      <th>Chart</th>
                      <th>Liquidity</th>
                      <th>Volume 1h</th>
                      <th title="Holder counts from an indexed data provider">Indexed Holders</th>
                      <th>24h</th>
                      <th>Age</th>
                      <th>Watch</th>
                    </tr>
                  </thead>

                  <tbody>
                    {filteredTokens.map(
                      (token) => (
                        <TokenRow
                          key={
                            token.id ||
                            `${token.chain}-${token.symbol}`
                          }
                          token={token}
                          watched={watchlist.some((item) => item.address === String(token.address || token.mint || token.id || "").toLowerCase())}
                          onToggleWatch={toggleWatch}
                          onClick={setSelectedToken}
                        />
                      )
                    )}
                  </tbody>
                </table>
              )}
            </section>

            {error && filteredTokens.length > 0 ? <div className="status error">Refresh issue: {error}. Keeping previously loaded coins visible.</div> : null}
            <div
              style={{
                marginTop: "14",
                display: "flex",
                justifyContent:
                  "space-between",
                color: "#626c7b",
                fontSize: "12px"
              }}
            >
              <span>
                {tokenView === "top" ? "Daily Top Tokens" : tokenView === "trending" ? "Trending Tokens" : "Newest Tokens"} · Showing {filteredTokens.length} tokens · Live launches detected this session: {liveLaunchCount}
              </span>

              <span>
                {lastUpdated
                  ? `Updated ${lastUpdated.toLocaleTimeString()}`
                  : ""}
              </span>
            </div>
          </>
        )}
      </main>

      <footer className="footer">
        FLASHBOYS — Independent crypto
        discovery platform.
      </footer>

      {accountOpen ? <AccountPanel onClose={() => setAccountOpen(false)} /> : null}

      <TokenModal
        token={selectedToken}
        watched={Boolean(selectedToken && watchlist.some((item) => item.address === String(selectedToken.address || selectedToken.mint || selectedToken.id || "").toLowerCase()))}
        onToggleWatch={toggleWatch}
        onClose={() =>
          setSelectedToken(null)
        }
      />
    </div>
  );
}
