import { io } from "socket.io-client";
import { useState, useEffect, useRef } from "react";

const COLORS     = ["#00FF88","#FF2060","#00FFFF","#FFD700","#FF00FF"];
const ROBOT_LIST = ["MASTER","SLAVE-01","SLAVE-02","SLAVE-03","SLAVE-04"];
const ROBOT_COLORS = {
  "MASTER":"#00FFFF","SLAVE-01":"#00FF88",
  "SLAVE-02":"#FFD700","SLAVE-03":"#FF2060","SLAVE-04":"#FF00FF",
};
const SHAPE_LIST = [
  {id:"circle",   icon:"⬤", label:"CIRCLE"},
  {id:"square",   icon:"■", label:"SQUARE"},
  {id:"triangle", icon:"▲", label:"TRIANGLE"},
  {id:"v_shape",  icon:"⋁", label:"V-SHAPE"},
  {id:"line",     icon:"━", label:"LINE"},
  {id:"diamond",  icon:"◆", label:"DIAMOND"},
];

function getFormation(shapeId, cx, cy, size){
  switch(shapeId){
    case "circle":
      return ROBOT_LIST.map((_,i)=>{
        const a=(i/ROBOT_LIST.length)*Math.PI*2-Math.PI/2;
        return {x:cx+Math.cos(a)*size*0.38, y:cy+Math.sin(a)*size*0.38};
      });
    case "square":{
      const h=size*0.32;
      return [{x:cx,y:cy},{x:cx-h,y:cy-h},{x:cx+h,y:cy-h},{x:cx-h,y:cy+h},{x:cx+h,y:cy+h}];
    }
    case "triangle":{
      const h=size*0.38;
      return [{x:cx,y:cy-h},{x:cx-h*1.1,y:cy+h*0.7},{x:cx+h*1.1,y:cy+h*0.7},{x:cx,y:cy},{x:cx,y:cy+h*0.15}];
    }
    case "v_shape":{
      const h=size*0.35;
      return [{x:cx,y:cy-h*0.3},{x:cx-h*0.6,y:cy+h*0.1},{x:cx+h*0.6,y:cy+h*0.1},{x:cx-h*1.1,y:cy+h*0.6},{x:cx+h*1.1,y:cy+h*0.6}];
    }
    case "line":{
      const g=size*0.2;
      return ROBOT_LIST.map((_,i)=>({x:cx+(i-2)*g*1.6,y:cy}));
    }
    case "diamond":{
      const h=size*0.36;
      return [{x:cx,y:cy-h},{x:cx-h,y:cy},{x:cx+h,y:cy},{x:cx,y:cy+h},{x:cx,y:cy}];
    }
    default: return ROBOT_LIST.map((_,i)=>({x:cx+(i-2)*40,y:cy}));
  }
}

function detectShape(points){
  if(points.length < 10) return null;
  const xs=points.map(p=>p.x), ys=points.map(p=>p.y);
  const minX=Math.min(...xs), maxX=Math.max(...xs);
  const minY=Math.min(...ys), maxY=Math.max(...ys);
  const width=maxX-minX, height=maxY-minY;
  const cx=(minX+maxX)/2, cy=(minY+maxY)/2;
  if(width<10||height<10) return null;
  const start=points[0], end=points[points.length-1];
  const closeDist=Math.sqrt((start.x-end.x)**2+(start.y-end.y)**2);
  const isClosed = closeDist < Math.max(width,height)*0.35;
  const avgR=points.reduce((s,p)=>s+Math.sqrt((p.x-cx)**2+(p.y-cy)**2),0)/points.length;
  const varR=points.reduce((s,p)=>{const r=Math.sqrt((p.x-cx)**2+(p.y-cy)**2);return s+(r-avgR)**2;},0)/points.length;
  const normVar=varR/(avgR*avgR);
  const aspect=width/height;
  if(!isClosed && (aspect>2.5||aspect<0.4)) return {shape:"line", cx, cy, size:Math.max(width,height)};
  if(!isClosed) return {shape:"v_shape", cx, cy, size:Math.max(width,height)};
  if(isClosed && normVar<0.08 && aspect>0.65 && aspect<1.5) return {shape:"circle", cx, cy, size:Math.max(width,height)};
  const corners=findCorners(points);
  if(isClosed && corners>=3 && corners<=4 && aspect>0.5 && aspect<2.5){
    if(corners===3) return {shape:"triangle", cx, cy, size:Math.max(width,height)};
  }
  if(isClosed && normVar>0.08 && normVar<0.3 && aspect>0.6 && aspect<1.4) return {shape:"diamond", cx, cy, size:Math.max(width,height)};
  if(isClosed && aspect>0.6 && aspect<1.65) return {shape:"square", cx, cy, size:Math.max(width,height)};
  return {shape:"circle", cx, cy, size:Math.max(width,height)};
}

function findCorners(points){
  let corners=0;
  const step=Math.max(1,Math.floor(points.length/30));
  for(let i=step;i<points.length-step;i+=step){
    const p0=points[i-step], p1=points[i], p2=points[i+step];
    const a1=Math.atan2(p1.y-p0.y,p1.x-p0.x);
    const a2=Math.atan2(p2.y-p1.y,p2.x-p1.x);
    let diff=Math.abs(a2-a1);
    if(diff>Math.PI) diff=Math.PI*2-diff;
    if(diff>0.7) corners++;
  }
  return corners;
}

function drawShapeOutline(ctx, shapeId, cx, cy, size, color){
  ctx.strokeStyle=color; ctx.lineWidth=2.5;
  ctx.shadowColor=color; ctx.shadowBlur=16;
  ctx.fillStyle=color+"12";
  ctx.beginPath();
  if(shapeId==="circle"){
    ctx.arc(cx,cy,size*0.38,0,Math.PI*2); ctx.fill(); ctx.stroke();
  } else if(shapeId==="square"){
    const h=size*0.32; ctx.rect(cx-h,cy-h,h*2,h*2); ctx.fill(); ctx.stroke();
  } else if(shapeId==="triangle"){
    const h=size*0.38;
    ctx.moveTo(cx,cy-h); ctx.lineTo(cx-h*1.1,cy+h*0.7); ctx.lineTo(cx+h*1.1,cy+h*0.7);
    ctx.closePath(); ctx.fill(); ctx.stroke();
  } else if(shapeId==="diamond"){
    const h=size*0.36;
    ctx.moveTo(cx,cy-h); ctx.lineTo(cx-h,cy); ctx.lineTo(cx,cy+h);
    ctx.lineTo(cx+h,cy); ctx.closePath(); ctx.fill(); ctx.stroke();
  } else if(shapeId==="v_shape"){
    const h=size*0.35;
    ctx.moveTo(cx,cy-h*0.3); ctx.lineTo(cx-h*1.1,cy+h*0.6);
    ctx.moveTo(cx,cy-h*0.3); ctx.lineTo(cx+h*1.1,cy+h*0.6); ctx.stroke();
  } else if(shapeId==="line"){
    const h=size*0.4;
    ctx.moveTo(cx-h,cy); ctx.lineTo(cx+h,cy); ctx.stroke();
  }
  ctx.shadowBlur=0;
}

const GlowText=({children,color="#00FFFF",size="0.65rem",style={}})=>(
  <span style={{color,fontSize:size,fontFamily:"'Orbitron',monospace",
    textShadow:`0 0 8px ${color},0 0 20px ${color}60`,letterSpacing:"0.08em",...style}}>{children}</span>
);
const PanelLabel=({children,color="#00FFFF"})=>(
  <div style={{padding:"4px 0",borderBottom:`1px solid ${color}30`,marginBottom:6}}>
    <GlowText color={color} size="0.55rem">[ {children} ]</GlowText>
  </div>
);
const PulseDot=({color,active=true,size=8})=>(
  <div style={{width:size,height:size,borderRadius:"50%",background:active?color:"#333",flexShrink:0,
    boxShadow:active?`0 0 6px ${color},0 0 14px ${color}80`:"none",
    animation:active?"pulse 1.5s ease-in-out infinite":"none",display:"inline-block"}}/>
);

const BatteryBar=({value, color})=>{
  const pct = Math.min(Math.max(value||0, 0), 100);
  const barColor = pct > 50 ? "#00FF88" : pct > 20 ? "#FFD700" : "#FF2060";
  return(
    <div style={{display:"flex",alignItems:"center",gap:4}}>
      <div style={{flex:1,background:"#111",height:4,borderRadius:2,overflow:"hidden"}}>
        <div style={{height:"100%",width:`${pct}%`,background:barColor,transition:"width 0.5s ease"}}/>
      </div>
      <span style={{fontSize:"0.28rem",color:barColor,fontFamily:"Orbitron,monospace",minWidth:24}}>{Math.round(pct)}%</span>
    </div>
  );
};

const SignalBars=({rssi})=>{
  const strength = rssi ? Math.max(0, Math.min(4, Math.round((rssi + 90) / 15))) : 0;
  return(
    <div style={{display:"flex",alignItems:"flex-end",gap:1,height:10}}>
      {[1,2,3,4].map(i=>(
        <div key={i} style={{width:3,height:i*2+2,background:i<=strength?"#00FF88":"#333",borderRadius:1}}/>
      ))}
    </div>
  );
};

const ArcMeter=({value,label,color})=>{
  const pct=Math.min(value,100)/100,r=28,cx=36,cy=36;
  const toRad=d=>d*Math.PI/180;
  const s={x:cx+r*Math.cos(toRad(150)),y:cy+r*Math.sin(toRad(150))};
  const e={x:cx+r*Math.cos(toRad(150+240*pct)),y:cy+r*Math.sin(toRad(150+240*pct))};
  return(
    <div style={{textAlign:"center",width:72}}>
      <svg width={72} height={58}>
        <path d={`M ${s.x} ${s.y} A ${r} ${r} 0 1 1 ${cx+r*Math.cos(toRad(390))} ${cy+r*Math.sin(toRad(390))}`} fill="none" stroke="#222" strokeWidth={4}/>
        {pct>0&&<path d={`M ${s.x} ${s.y} A ${r} ${r} 0 ${240*pct>180?1:0} 1 ${e.x} ${e.y}`} fill="none" stroke={color} strokeWidth={4} style={{filter:`drop-shadow(0 0 5px ${color})`}}/>}
        <text x={cx} y={cy+6} textAnchor="middle" fill={color} style={{fontSize:"0.58rem",fontFamily:"Orbitron,monospace"}}>{Math.round(value)}%</text>
      </svg>
      <div style={{fontSize:"0.4rem",color,fontFamily:"Orbitron,monospace",marginTop:-6}}>{label}</div>
    </div>
  );
};

function GPSMap({robots, selectedRobot, onSelect, leaderID}){
  const W=195, H=160;
  return(
    <div style={{position:"relative",width:W,height:H,background:"#020c14",border:"1px solid #00FFFF20",overflow:"hidden"}}>
      <svg width={W} height={H} style={{position:"absolute",inset:0}}>
        {[0,25,50,75,100].map(v=>(
          <g key={v}>
            <line x1={v*W/100} y1={0} x2={v*W/100} y2={H} stroke="#00FFFF06" strokeWidth={1}/>
            <line x1={0} y1={v*H/100} x2={W} y2={v*H/100} stroke="#00FFFF06" strokeWidth={1}/>
          </g>
        ))}
        {leaderID && Object.entries(robots).filter(([n])=>n!==leaderID&&robots[n].active).map(([name,r])=>(
          <line key={name}
            x1={robots[leaderID]?.x*W/100||0} y1={robots[leaderID]?.y*H/100||0}
            x2={r.x*W/100} y2={r.y*H/100}
            stroke={ROBOT_COLORS[name]+"25"} strokeWidth={1} strokeDasharray="3,3"/>
        ))}
        {Object.entries(robots).map(([name,r])=>{
          const cx=r.x*W/100, cy=r.y*H/100;
          const color=ROBOT_COLORS[name]||"#aaa";
          const sel=selectedRobot===name;
          const isLeader=name===leaderID;
          const isOnline=r.active;
          return(
            <g key={name} onClick={()=>onSelect(name)} style={{cursor:"pointer"}}>
              {isOnline&&<circle cx={cx} cy={cy} r={sel?9:6} fill="none" stroke={color} strokeWidth={sel?2:1} opacity={0.4}/>}
              {isLeader&&<circle cx={cx} cy={cy} r={13} fill="none" stroke="#FFD700" strokeWidth={1.5} opacity={0.8} strokeDasharray="3,2"/>}
              <circle cx={cx} cy={cy} r={isLeader?5.5:3.5}
                fill={isOnline?(isLeader?"#FFD700":color):"#333"}
                style={{filter:isOnline?`drop-shadow(0 0 4px ${isLeader?"#FFD700":color})`:"none"}}/>
              {isLeader&&<text x={cx} y={cy-16} textAnchor="middle" fill="#FFD700" fontSize="8">♛</text>}
              {!isOnline&&<text x={cx} y={cy+4} textAnchor="middle" fill="#FF2060" fontSize="8">✕</text>}
              <text x={cx+7} y={cy-3} fill={isLeader?"#FFD700":color} fontSize="5" fontFamily="Orbitron,monospace" opacity={0.9}>
                {name.replace("SLAVE-","")}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function FormationDisplay({shapeId, colorIdx, robotPositions, transmitting}){
  const ref=useRef(null);
  const animRef=useRef(null);
  const posRef=useRef(robotPositions.map(p=>({...p})));
  const targetRef=useRef(robotPositions);
  const W=340, H=320;
  useEffect(()=>{ targetRef.current=robotPositions; },[robotPositions]);
  useEffect(()=>{
    const tick=()=>{
      posRef.current=posRef.current.map((p,i)=>{
        const t=targetRef.current[i];
        const dx=t.x-p.x, dy=t.y-p.y;
        const d=Math.sqrt(dx*dx+dy*dy);
        if(d<0.5) return {...p,x:t.x,y:t.y};
        const spd=Math.min(d*0.1,7);
        return {...p,x:p.x+dx/d*spd,y:p.y+dy/d*spd};
      });
      draw();
      animRef.current=requestAnimationFrame(tick);
    };
    animRef.current=requestAnimationFrame(tick);
    return()=>cancelAnimationFrame(animRef.current);
  },[shapeId,colorIdx,transmitting]);
  const draw=()=>{
    const cv=ref.current; if(!cv) return;
    const ctx=cv.getContext("2d"),col=COLORS[colorIdx];
    ctx.clearRect(0,0,W,H);
    ctx.fillStyle="#020c18"; ctx.fillRect(0,0,W,H);
    ctx.strokeStyle="#00FFFF06"; ctx.lineWidth=1;
    for(let x=0;x<W;x+=32){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();}
    for(let y=0;y<H;y+=32){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}
    const br=16; ctx.strokeStyle="#00FFFF25"; ctx.lineWidth=2;
    [[0,0,br,0,0,br],[W-br,0,W,0,W,br],[0,H-br,0,H,br,H],[W-br,H,W,H,W,H-br]].forEach(([x1,y1,x2,y2,x3,y3])=>{
      ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.lineTo(x3,y3);ctx.stroke();
    });
    const ps=posRef.current;
    if(shapeId){
      const xs=targetRef.current.map(p=>p.x), ys=targetRef.current.map(p=>p.y);
      const cx=(Math.min(...xs)+Math.max(...xs))/2;
      const cy=(Math.min(...ys)+Math.max(...ys))/2;
      const size=Math.max(Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys))*1.1;
      drawShapeOutline(ctx,shapeId,cx,cy,size,col+"60");
    }
    ctx.strokeStyle=col+"20"; ctx.lineWidth=1; ctx.setLineDash([3,3]);
    for(let i=1;i<ps.length;i++){
      ctx.beginPath();ctx.moveTo(ps[0].x,ps[0].y);ctx.lineTo(ps[i].x,ps[i].y);ctx.stroke();
    }
    ctx.setLineDash([]);
    targetRef.current.forEach(t=>{
      ctx.beginPath(); ctx.arc(t.x,t.y,9,0,Math.PI*2);
      ctx.strokeStyle=col+"30"; ctx.lineWidth=1;
      ctx.setLineDash([2,2]); ctx.stroke(); ctx.setLineDash([]);
    });
    ps.forEach((p,i)=>{
      const name=ROBOT_LIST[i], color=ROBOT_COLORS[name], isMaster=name==="MASTER";
      ctx.beginPath(); ctx.arc(p.x,p.y,isMaster?14:10,0,Math.PI*2);
      ctx.strokeStyle=color+"50"; ctx.lineWidth=1.5;
      ctx.shadowColor=color; ctx.shadowBlur=8; ctx.stroke(); ctx.shadowBlur=0;
      ctx.beginPath(); ctx.arc(p.x,p.y,isMaster?9:6,0,Math.PI*2);
      ctx.fillStyle=color; ctx.shadowColor=color; ctx.shadowBlur=12; ctx.fill(); ctx.shadowBlur=0;
      ctx.beginPath(); ctx.arc(p.x,p.y,isMaster?3.5:2.5,0,Math.PI*2);
      ctx.fillStyle="#020810"; ctx.fill();
      ctx.fillStyle=color; ctx.font=`bold ${isMaster?8:7}px Orbitron,monospace`; ctx.textAlign="center";
      ctx.fillText(isMaster?"M":name.replace("SLAVE-",""),p.x,p.y-(isMaster?19:15));
    });
    ctx.shadowBlur=0; ctx.textAlign="center";
    if(shapeId){
      ctx.fillStyle=col+"50"; ctx.font="bold 10px Orbitron,monospace";
      ctx.fillText((SHAPE_LIST.find(s=>s.id===shapeId)?.label||shapeId.toUpperCase())+" FORMATION",W/2,H-10);
    }
    if(transmitting){
      ctx.strokeStyle="#00FF88"; ctx.lineWidth=3;
      ctx.shadowColor="#00FF88"; ctx.shadowBlur=20;
      ctx.strokeRect(3,3,W-6,H-6); ctx.shadowBlur=0;
      ctx.fillStyle="#00FF8818"; ctx.fillRect(0,0,W,H);
      ctx.fillStyle="#00FF88"; ctx.font="bold 13px Orbitron,monospace";
      ctx.fillText("▶ TRANSMITTING TO SWARM...",W/2,H-28);
    }
  };
  return(
    <canvas ref={ref} width={W} height={H}
      style={{width:"100%",height:"100%",display:"block",
        border:`1px solid ${COLORS[colorIdx]}30`,
        boxShadow:`0 0 20px ${COLORS[colorIdx]}10`}}/>
  );
}

function DrawCanvas({colorIdx, onShapeDetected}){
  const ref=useRef(null);
  const drawing=useRef(false);
  const currentPoints=useRef([]);
  const drawnPaths=useRef([]);
  const W=340, H=320;
  const detectedRef=useRef(null);
  const redraw=()=>{
    const cv=ref.current; if(!cv) return;
    const ctx=cv.getContext("2d"), col=COLORS[colorIdx];
    ctx.clearRect(0,0,W,H);
    ctx.fillStyle="#020c18"; ctx.fillRect(0,0,W,H);
    ctx.strokeStyle="#FFD70008"; ctx.lineWidth=1;
    for(let x=0;x<W;x+=32){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();}
    for(let y=0;y<H;y+=32){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}
    const br=16; ctx.strokeStyle="#FFD70025"; ctx.lineWidth=2;
    [[0,0,br,0,0,br],[W-br,0,W,0,W,br],[0,H-br,0,H,br,H],[W-br,H,W,H,W,H-br]].forEach(([x1,y1,x2,y2,x3,y3])=>{
      ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.lineTo(x3,y3);ctx.stroke();
    });
    drawnPaths.current.forEach(path=>{
      if(path.length<2) return;
      ctx.beginPath(); ctx.moveTo(path[0].x,path[0].y);
      path.forEach(p=>ctx.lineTo(p.x,p.y));
      ctx.strokeStyle=col+"40"; ctx.lineWidth=2;
      ctx.lineJoin="round"; ctx.lineCap="round"; ctx.stroke();
    });
    if(detectedRef.current){
      const {shape,cx,cy,size}=detectedRef.current;
      drawShapeOutline(ctx,shape,cx,cy,size,col);
      ctx.fillStyle="#00FF88"; ctx.font="bold 11px Orbitron,monospace"; ctx.textAlign="center";
      ctx.fillText("✓ DETECTED: "+(SHAPE_LIST.find(s=>s.id===shape)?.label||shape),W/2,H-12);
    } else if(drawnPaths.current.length===0){
      ctx.fillStyle="#FFD70015"; ctx.font="bold 13px Orbitron,monospace"; ctx.textAlign="center";
      ctx.fillText("✏ DRAW A SHAPE",W/2,H/2-12);
      ctx.font="9px Orbitron,monospace"; ctx.fillStyle="#FFD70010";
      ctx.fillText("draw circle, square, triangle, V, line, diamond",W/2,H/2+10);
    }
  };
  const getPos=(e)=>{
    const cv=ref.current; if(!cv) return {x:0,y:0};
    const r=cv.getBoundingClientRect(),cl=e.touches?e.touches[0]:e;
    return {x:(cl.clientX-r.left)*(W/r.width),y:(cl.clientY-r.top)*(H/r.height)};
  };
  const onDown=(e)=>{ e.preventDefault(); drawing.current=true; detectedRef.current=null; drawnPaths.current=[]; currentPoints.current=[getPos(e)]; onShapeDetected(null); redraw(); };
  const onMove=(e)=>{ e.preventDefault(); if(!drawing.current) return; currentPoints.current.push(getPos(e)); drawnPaths.current=[currentPoints.current]; redraw(); };
  const onUp=(e)=>{ if(!drawing.current) return; drawing.current=false; const detected=detectShape(currentPoints.current); if(detected){ detectedRef.current=detected; onShapeDetected(detected); } redraw(); };
  const clearCanvas=()=>{ drawnPaths.current=[]; currentPoints.current=[]; detectedRef.current=null; onShapeDetected(null); redraw(); };
  useEffect(()=>{ redraw(); },[colorIdx]);
  return(
    <div style={{display:"flex",flexDirection:"column",gap:6,height:"100%"}}>
      <canvas ref={ref} width={W} height={H}
        style={{width:"100%",flex:1,display:"block",cursor:"crosshair",
          border:"1px solid #FFD70030",boxShadow:"0 0 15px #FFD70010",touchAction:"none"}}
        onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}
        onTouchStart={onDown} onTouchMove={onMove} onTouchEnd={onUp}/>
      <button onClick={clearCanvas} style={{padding:"7px",background:"rgba(255,32,96,0.1)",border:"1px solid #FF206050",color:"#FF2060",fontSize:"0.4rem",fontFamily:"Orbitron,monospace",letterSpacing:"0.08em"}}>⌫ CLEAR CANVAS</button>
    </div>
  );
}

export default function SwarmDashboard(){
  const bootRef=useRef(Date.now());
  const txTimerRef=useRef(null);
  const socketRef=useRef(null);

  const [uptime,         setUptime]        = useState(0);
  const [colorIdx,       setColorIdx]      = useState(0);
  const [detectedShape,  setDetectedShape] = useState(null);
  const [transmitting,   setTransmitting]  = useState(false);
  const [lastShape,      setLastShape]     = useState("NONE");
  const [shapesLog,      setShapesLog]     = useState([]);
  const [selectedRobots, setSelectedRobots]= useState([]);
  const [commandMsg,     setCommandMsg]    = useState("");
  const [recentCmds,     setRecentCmds]   = useState(()=>{ try{return JSON.parse(localStorage.getItem("swarm_commands"))||[];}catch{return [];} });
  const [selectedRobot,  setSelectedRobot] = useState(null);
  const [regUsers,       setRegUsers]      = useState(()=>{ try{return JSON.parse(localStorage.getItem("swarm_users_v1"))||[];}catch{return [];} });
  const [showUsers,      setShowUsers]     = useState(false);
  const [leaderID,       setLeaderID]      = useState(null);
  const [swarmMode,      setSwarmMode]     = useState("PEER");
  const [connected,      setConnected]     = useState(false);
  const [electing,       setElecting]      = useState(false);
  const [realDataActive, setRealDataActive]= useState(false);

  const [gpsRobots, setGpsRobots] = useState({
    "MASTER":  {x:50,y:50,heading:45,speed:0,  status:"PEER",   active:false, battery:100, signal:-60, lat:0, lon:0, lastSeen:null},
    "SLAVE-01":{x:38,y:62,heading:45,speed:0,  status:"PEER",   active:false, battery:0,   signal:0,   lat:0, lon:0, lastSeen:null},
    "SLAVE-02":{x:62,y:62,heading:45,speed:0,  status:"PEER",   active:false, battery:0,   signal:0,   lat:0, lon:0, lastSeen:null},
    "SLAVE-03":{x:30,y:75,heading:90,speed:0,  status:"PEER",   active:false, battery:0,   signal:0,   lat:0, lon:0, lastSeen:null},
    "SLAVE-04":{x:70,y:75,heading:90,speed:0,  status:"OFFLINE",active:false, battery:0,   signal:0,   lat:0, lon:0, lastSeen:null},
  });

  const formationPositions = detectedShape
    ? getFormation(detectedShape.shape, 170, 160, 280)
    : getFormation("circle", 170, 160, 280);

  // ── GPS simulation — only runs before real data arrives ───
  useEffect(()=>{
    if(realDataActive) return;
    const iv=setInterval(()=>{
      setGpsRobots(prev=>{
        const next={...prev};
        Object.keys(next).forEach(name=>{
          const r=next[name]; if(!r.active||r.speed===0) return;
          const dh=(Math.random()-0.5)*8,newH=(r.heading+dh+360)%360;
          next[name]={...r,heading:newH,
            x:Math.max(5,Math.min(95,r.x+Math.cos((newH-90)*Math.PI/180)*r.speed*0.3)),
            y:Math.max(5,Math.min(95,r.y+Math.sin((newH-90)*Math.PI/180)*r.speed*0.3))};
        });
        return next;
      });
    },800);
    return()=>clearInterval(iv);
  },[realDataActive]);

  // ── FIXED: check every 1s, mark offline after 5s silence ─
  useEffect(()=>{
    const iv=setInterval(()=>{
      const now=Date.now();
      setGpsRobots(prev=>{
        const next={...prev};
        Object.keys(next).forEach(name=>{
          const r=next[name];
          if(r.lastSeen && now - r.lastSeen > 5000){
            if(r.active){
              next[name]={...r, active:false, status:"OFFLINE", speed:0, battery:0};
            }
          }
        });
        return next;
      });
    }, 1000);  // every 1 second
    return()=>clearInterval(iv);
  },[]);

  // ── Socket.IO ─────────────────────────────────────────────
  useEffect(()=>{
    const socket=io("http://localhost:5000");
    socketRef.current=socket;
    socket.on("connect",()=>{ setConnected(true); });
    socket.on("disconnect",()=>{ setConnected(false); });

    socket.on("robot_update",(data)=>{
      setRealDataActive(true);
      setGpsRobots(prev=>({
        ...prev,
        [data.robot_id]:{
          ...prev[data.robot_id],
          x:        data.x,
          y:        data.y,
          heading:  data.heading,
          speed:    data.speed,
          status:   data.active ? (data.status||"PEER") : "OFFLINE",
          active:   data.active,
          battery:  data.active ? (data.battery||100) : 0,
          signal:   data.signal||-60,
          lat:      data.lat||0,
          lon:      data.lon||0,
          lastSeen: data.active ? Date.now() : prev[data.robot_id]?.lastSeen,
        }
      }));
    });

    socket.on("leader_elected",(data)=>{
      const winner=data.leader_id;
      setLeaderID(winner);
      setSwarmMode("LEADER");
      setElecting(false);
      setGpsRobots(prev=>{
        const next={};
        Object.entries(prev).forEach(([rid,r])=>{ next[rid]={...r,status:rid===winner?"LEADER":"SLAVE"}; });
        return next;
      });
    });
    socket.on("election_started",()=>setElecting(true));
    socket.on("leader_lost",()=>{ setLeaderID(null); setElecting(false); });
    socket.on("leader_cleared",()=>{ setLeaderID(null); setSwarmMode("PEER"); });
    return()=>socket.disconnect();
  },[]);

  useEffect(()=>{
    const iv=setInterval(()=>{
      setUptime(Math.floor((Date.now()-bootRef.current)/1000));
      try{setRegUsers(JSON.parse(localStorage.getItem("swarm_users_v1"))||[]);}catch(e){}
    },1000);
    return()=>clearInterval(iv);
  },[]);

  useEffect(()=>{
    const onKey=e=>{ if(e.key==="c"||e.key==="C") setColorIdx(p=>(p+1)%COLORS.length); };
    window.addEventListener("keydown",onKey);
    return()=>window.removeEventListener("keydown",onKey);
  },[]);

  const sendFormation=()=>{
    if(!detectedShape) return;
    const label=SHAPE_LIST.find(s=>s.id===detectedShape.shape)?.label||detectedShape.shape.toUpperCase();
    setTransmitting(true); setLastShape(label);
    setShapesLog(p=>[label,...p.slice(0,7)]);
    clearTimeout(txTimerRef.current);
    txTimerRef.current=setTimeout(()=>setTransmitting(false),2200);
    if(socketRef.current){
      socketRef.current.emit("send_command",{cmd:"formation",shape:detectedShape.shape,robot_id:"all"});
    }
    const cmd={id:Date.now(),type:"SHAPE",shape:label,target:"ALL",time:new Date().toLocaleTimeString("en-US",{hour12:false})};
    const updated=[cmd,...(JSON.parse(localStorage.getItem("swarm_commands")||"[]"))].slice(0,20);
    localStorage.setItem("swarm_commands",JSON.stringify(updated));
    setRecentCmds(updated);
  };

  const sendCommand=()=>{
    if(!commandMsg.trim()) return;
    if(socketRef.current){
      socketRef.current.emit("send_command",{cmd:commandMsg.toLowerCase().trim(),robot_id:selectedRobots.length===0?"all":"SLAVE-"+selectedRobots[0]});
    }
    const cmd={id:Date.now(),type:"CMD",message:commandMsg,target:selectedRobots.length===0?"ALL":selectedRobots.join("+"),time:new Date().toLocaleTimeString("en-US",{hour12:false})};
    const updated=[cmd,...recentCmds].slice(0,8);
    localStorage.setItem("swarm_commands",JSON.stringify(updated));
    setRecentCmds(updated); setCommandMsg("");
  };

  const electLeader=()=>{ if(socketRef.current){ socketRef.current.emit("start_election"); setElecting(true); } };
  const endLeaderMode=()=>{ if(socketRef.current){ socketRef.current.emit("end_leader_mode"); setSwarmMode("PEER"); setLeaderID(null); } };

  const m=Math.floor(uptime/60),s2=uptime%60,col=COLORS[colorIdx];

  return(
    <div style={{width:"100vw",height:"100vh",background:"#020810",display:"flex",flexDirection:"column",overflow:"hidden",fontFamily:"'Orbitron',monospace"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&display=swap');
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}
        @keyframes tx{0%{opacity:1}50%{opacity:0.3}100%{opacity:1}}
        @keyframes electing{0%{opacity:1}50%{opacity:0.2}100%{opacity:1}}
        *{box-sizing:border-box}
        ::-webkit-scrollbar{width:3px;background:#020810}
        ::-webkit-scrollbar-thumb{background:#00FFFF40}
        input{background:#0a0a0a;border:1px solid #333;color:#aaa;padding:5px 8px;font-family:Orbitron,monospace;font-size:0.36rem;outline:none;width:100%;}
        input:focus{border-color:#00FFFF;}
        button{cursor:pointer;font-family:Orbitron,monospace;transition:all 0.2s;}
      `}</style>

      <div style={{height:50,background:"rgba(0,10,20,0.97)",borderBottom:"1px solid #00FFFF25",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 18px"}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <PulseDot color={connected?"#00FF88":"#FF2060"} size={9}/>
          <GlowText color={connected?"#00FF88":"#FF2060"} size="0.55rem">{connected?"BRIDGE OK":"NO BRIDGE"}</GlowText>
          <span style={{color:"#333",margin:"0 6px"}}>|</span>
          <GlowText color="#444" size="0.5rem">UP {String(m).padStart(2,"0")}:{String(s2).padStart(2,"0")}</GlowText>
          <span style={{color:"#333",margin:"0 6px"}}>|</span>
          <GlowText color={swarmMode==="LEADER"?"#FFD700":"#1D9E75"} size="0.5rem">
            {swarmMode==="LEADER"?`♛ LEADER — ${leaderID||"..."}` : "◈ PEER MODE"}
          </GlowText>
        </div>
        <GlowText color="#00FFFF" size="0.9rem" style={{fontWeight:900,letterSpacing:"0.15em"}}>⬡ SWARM MASTER CONTROL</GlowText>
        <GlowText color={transmitting?"#00FF88":"#FFD700"} size="0.6rem" style={{animation:transmitting?"tx 0.4s ease infinite":"none"}}>
          {transmitting?"● TRANSMITTING":"○ STANDBY"} — {lastShape}
        </GlowText>
      </div>

      <div style={{flex:1,display:"flex",overflow:"hidden"}}>

        <div style={{width:210,flexShrink:0,background:"rgba(0,5,15,0.92)",borderRight:"1px solid #00FFFF18",padding:"10px",overflow:"auto",display:"flex",flexDirection:"column",gap:10}}>
          <div>
            <PanelLabel>ROBOT STATUS</PanelLabel>
            {Object.entries(gpsRobots).map(([name,r])=>{
              const isLeader=name===leaderID;
              const isOnline=r.active;
              const timeSince=r.lastSeen?Math.floor((Date.now()-r.lastSeen)/1000):null;
              return(
                <div key={name} style={{marginBottom:6,padding:"5px 7px",
                  background:isLeader?"rgba(255,215,0,0.07)":"rgba(0,0,0,0.2)",
                  border:isLeader?"1px solid #FFD70040":"1px solid transparent",
                  borderRadius:4}}>
                  <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:3}}>
                    <PulseDot color={isOnline?(isLeader?"#FFD700":ROBOT_COLORS[name]):"#333"} active={isOnline} size={6}/>
                    <div style={{flex:1}}>
                      <div style={{fontSize:"0.44rem",color:isLeader?"#FFD700":"#ccc",fontFamily:"Orbitron,monospace",display:"flex",alignItems:"center",gap:4}}>
                        {isLeader&&<span style={{fontSize:"0.5rem"}}>♛</span>}
                        {name}
                      </div>
                    </div>
                    <div style={{fontSize:"0.28rem",fontFamily:"Orbitron,monospace",
                      color:isOnline?"#00FF88":"#FF2060",
                      background:isOnline?"rgba(0,255,136,0.1)":"rgba(255,32,96,0.1)",
                      padding:"1px 5px",borderRadius:3}}>
                      {isOnline?"ONLINE":"OFFLINE"}
                    </div>
                  </div>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                    <span style={{fontSize:"0.3rem",color:
                      r.status==="LEADER"?"#FFD700":
                      r.status==="SLAVE"?"#00FFFF":
                      r.status==="PEER"?"#1D9E75":"#FF2060",
                      fontFamily:"Orbitron,monospace"}}>{r.status}</span>
                    <span style={{fontSize:"0.28rem",color:"#444",fontFamily:"Orbitron,monospace"}}>
                      {timeSince!==null?`${timeSince}s ago`:"no data"}
                    </span>
                  </div>
                  {isOnline&&(
                    <div style={{marginBottom:3}}>
                      <div style={{fontSize:"0.26rem",color:"#444",marginBottom:2,fontFamily:"Orbitron,monospace"}}>BATTERY</div>
                      <BatteryBar value={r.battery} color={ROBOT_COLORS[name]}/>
                    </div>
                  )}
                  {isOnline&&(
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <div style={{display:"flex",alignItems:"center",gap:4}}>
                        <span style={{fontSize:"0.26rem",color:"#444",fontFamily:"Orbitron,monospace"}}>SIG</span>
                        <SignalBars rssi={r.signal}/>
                      </div>
                      <span style={{fontSize:"0.28rem",color:"#555",fontFamily:"Orbitron,monospace"}}>{(r.speed||0).toFixed(1)}m/s</span>
                    </div>
                  )}
                  {isOnline&&r.lat!==0&&(
                    <div style={{marginTop:3,fontSize:"0.26rem",color:"#1D9E75",fontFamily:"Orbitron,monospace",
                      background:"rgba(0,255,136,0.05)",padding:"2px 4px",borderRadius:2}}>
                      {r.lat.toFixed(5)}°N {r.lon.toFixed(5)}°E
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div>
            <PanelLabel color="#FFD700">LEADER CONTROL</PanelLabel>
            <button onClick={electLeader} disabled={electing||swarmMode==="LEADER"}
              style={{width:"100%",padding:"7px",marginBottom:5,
                background:electing?"rgba(255,215,0,0.2)":"rgba(255,215,0,0.08)",
                border:`1px solid ${electing?"#FFD700":"#FFD70050"}`,
                color:electing?"#FFD700":"#FFD70080",fontSize:"0.36rem",
                animation:electing?"electing 0.6s ease infinite":"none",
                cursor:electing||swarmMode==="LEADER"?"not-allowed":"pointer"}}>
              {electing?"⟳ ELECTING...":"♛ ELECT LEADER"}
            </button>
            <button onClick={endLeaderMode} disabled={swarmMode==="PEER"}
              style={{width:"100%",padding:"7px",
                background:"rgba(255,32,96,0.08)",
                border:`1px solid ${swarmMode==="LEADER"?"#FF206060":"#333"}`,
                color:swarmMode==="LEADER"?"#FF2060":"#444",fontSize:"0.36rem",
                cursor:swarmMode==="PEER"?"not-allowed":"pointer"}}>
              ✕ BACK TO PEER MODE
            </button>
            {leaderID&&(
              <div style={{marginTop:6,padding:"4px 6px",background:"rgba(255,215,0,0.05)",border:"1px solid #FFD70030",fontSize:"0.32rem",color:"#FFD700",fontFamily:"Orbitron,monospace"}}>
                ♛ LEADER: {leaderID}
              </div>
            )}
          </div>

          <div style={{flex:1}}>
            <PanelLabel>SHAPE LOG</PanelLabel>
            {shapesLog.length===0
              ?<div style={{fontSize:"0.38rem",color:"#333"}}>NO SHAPES SENT</div>
              :shapesLog.map((s,i)=>(
                <div key={i} style={{fontSize:"0.38rem",color:`rgba(0,255,136,${1-i*0.12})`,marginBottom:3}}>► {s}</div>
              ))}
          </div>
        </div>

        <div style={{flex:1,display:"flex",gap:0,overflow:"hidden"}}>
          <div style={{flex:1,display:"flex",flexDirection:"column",padding:"8px",gap:6,overflow:"hidden",borderRight:"1px solid #FFD70020"}}>
            <div style={{flexShrink:0}}><PanelLabel color="#FFD700">✏ DRAW YOUR SHAPE</PanelLabel></div>
            <div style={{display:"flex",gap:6,alignItems:"center",flexShrink:0}}>
              <span style={{fontSize:"0.32rem",color:"#555",fontFamily:"Orbitron,monospace"}}>COLOR:</span>
              {COLORS.map((c,i)=>(
                <div key={c} onClick={()=>setColorIdx(i)} style={{width:colorIdx===i?18:13,height:colorIdx===i?18:13,borderRadius:"50%",background:c,cursor:"pointer",boxShadow:`0 0 ${colorIdx===i?10:3}px ${c}`,transition:"all 0.2s",border:colorIdx===i?"2px solid white":"none"}}/>
              ))}
              {detectedShape&&(
                <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:5,background:"rgba(0,255,136,0.08)",border:"1px solid #00FF8840",padding:"3px 8px"}}>
                  <span style={{fontSize:"0.32rem",color:"#00FF88",fontFamily:"Orbitron,monospace"}}>
                    ✓ {SHAPE_LIST.find(s=>s.id===detectedShape.shape)?.icon} {SHAPE_LIST.find(s=>s.id===detectedShape.shape)?.label}
                  </span>
                </div>
              )}
            </div>
            <div style={{flex:1,minHeight:0}}><DrawCanvas colorIdx={colorIdx} onShapeDetected={setDetectedShape}/></div>
          </div>
          <div style={{flex:1,display:"flex",flexDirection:"column",padding:"8px",gap:6,overflow:"hidden"}}>
            <div style={{flexShrink:0}}><PanelLabel color="#00FFFF">⬡ ROBOT FORMATION</PanelLabel></div>
            <div style={{flex:1,minHeight:0}}>
              <FormationDisplay shapeId={detectedShape?.shape||null} colorIdx={colorIdx} robotPositions={formationPositions} transmitting={transmitting}/>
            </div>
            <button onClick={sendFormation} disabled={!detectedShape}
              style={{flexShrink:0,padding:"11px",
                background:detectedShape?(transmitting?"rgba(0,255,136,0.25)":"rgba(0,255,136,0.14)"):"rgba(0,0,0,0.3)",
                border:`2px solid ${detectedShape?"#00FF88":"#222"}`,
                color:detectedShape?"#00FF88":"#333",fontSize:"0.55rem",fontFamily:"Orbitron,monospace",
                letterSpacing:"0.12em",fontWeight:700,
                boxShadow:detectedShape?"0 0 20px #00FF8830":"none",
                animation:transmitting?"tx 0.4s ease infinite":"none",
                cursor:detectedShape?"pointer":"not-allowed"}}>
              {transmitting?"● TRANSMITTING...":detectedShape?`▶ SEND ${SHAPE_LIST.find(s=>s.id===detectedShape.shape)?.label||""} FORMATION`:"DRAW A SHAPE FIRST"}
            </button>
          </div>
        </div>

        <div style={{width:225,flexShrink:0,background:"rgba(0,5,15,0.92)",borderLeft:"1px solid #00FFFF18",padding:"10px",overflow:"auto",display:"flex",flexDirection:"column",gap:10}}>
          <div>
            <PanelLabel color="#00FF88">GPS TRACKING</PanelLabel>
            <GPSMap robots={gpsRobots} selectedRobot={selectedRobot} onSelect={n=>setSelectedRobot(p=>p===n?null:n)} leaderID={leaderID}/>
            {selectedRobot&&gpsRobots[selectedRobot]&&(()=>{
              const r=gpsRobots[selectedRobot];
              const isLeader=selectedRobot===leaderID;
              return(
                <div style={{marginTop:5,padding:"6px 8px",background:"rgba(0,255,136,0.05)",border:"1px solid #00FF8830",borderRadius:4}}>
                  <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:5}}>
                    {isLeader&&<span style={{color:"#FFD700",fontSize:"0.7rem"}}>♛</span>}
                    <GlowText color={isLeader?"#FFD700":ROBOT_COLORS[selectedRobot]||"#aaa"} size="0.42rem" style={{fontWeight:700}}>{selectedRobot}</GlowText>
                    <span style={{marginLeft:"auto",fontSize:"0.28rem",color:r.active?"#00FF88":"#FF2060",fontFamily:"Orbitron,monospace"}}>
                      {r.active?"● ONLINE":"○ OFFLINE"}
                    </span>
                  </div>
                  <div style={{background:"rgba(0,0,0,0.3)",padding:"5px",borderRadius:3,marginBottom:5}}>
                    <div style={{fontSize:"0.28rem",color:"#555",fontFamily:"Orbitron,monospace",marginBottom:2}}>GPS COORDINATES</div>
                    <div style={{fontSize:"0.36rem",color:"#1D9E75",fontFamily:"Orbitron,monospace"}}>{r.lat!==0?`${r.lat.toFixed(6)}°N`:"No fix"}</div>
                    <div style={{fontSize:"0.36rem",color:"#1D9E75",fontFamily:"Orbitron,monospace"}}>{r.lon!==0?`${r.lon.toFixed(6)}°E`:"No fix"}</div>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:4}}>
                    {[["HEADING",`${Math.round(r.heading||0)}°`],["SPEED",`${(r.speed||0).toFixed(1)}m/s`],["BATTERY",`${Math.round(r.battery||0)}%`],["STATUS",r.status||"--"]].map(([k,v])=>(
                      <div key={k} style={{background:"rgba(0,0,0,0.2)",padding:"3px 5px",borderRadius:2}}>
                        <div style={{fontSize:"0.24rem",color:"#555",fontFamily:"Orbitron,monospace"}}>{k}</div>
                        <div style={{fontSize:"0.34rem",color:ROBOT_COLORS[selectedRobot]||"#aaa",fontFamily:"Orbitron,monospace"}}>{v}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{marginTop:5}}><BatteryBar value={r.battery} color={ROBOT_COLORS[selectedRobot]}/></div>
                </div>
              );
            })()}
          </div>

          <div>
            <PanelLabel color="#FF2060">TARGET SELECT</PanelLabel>
            <button onClick={()=>setSelectedRobots([])} style={{width:"100%",padding:"5px 8px",marginBottom:4,background:selectedRobots.length===0?"rgba(255,32,96,0.2)":"rgba(0,0,0,0.3)",border:`1px solid ${selectedRobots.length===0?"#FF2060":"#333"}`,color:selectedRobots.length===0?"#FF2060":"#555",fontSize:"0.36rem",fontFamily:"Orbitron,monospace"}}>🌐 BROADCAST ALL</button>
            {["01","02","03","04"].map(id=>(
              <button key={id} onClick={()=>setSelectedRobots(p=>p.includes(id)?p.filter(s=>s!==id):[...p,id])} style={{width:"100%",padding:"4px 8px",marginBottom:3,background:selectedRobots.includes(id)?"rgba(0,255,136,0.15)":"rgba(0,0,0,0.3)",border:`1px solid ${selectedRobots.includes(id)?"#00FF88":"#333"}`,color:selectedRobots.includes(id)?"#00FF88":"#555",fontSize:"0.34rem",fontFamily:"Orbitron,monospace"}}>
                {selectedRobots.includes(id)?"✓":"◯"} SLAVE-{id}{`SLAVE-${id}`===leaderID?" ♛":""}
              </button>
            ))}
          </div>

          <div>
            <PanelLabel color="#FF2060">ROBOT COMMAND</PanelLabel>
            <input type="text" placeholder="forward / stop / left / right" value={commandMsg} onChange={e=>setCommandMsg(e.target.value)} onKeyDown={e=>e.key==="Enter"&&sendCommand()}/>
            <button onClick={sendCommand} style={{width:"100%",padding:"6px",marginTop:4,background:"rgba(255,32,96,0.15)",border:"1px solid #FF2060",color:"#FF2060",fontSize:"0.36rem",fontFamily:"Orbitron,monospace",fontWeight:700}}>▶ SEND CMD</button>
            {recentCmds.slice(0,4).map((cmd,i)=>(
              <div key={cmd.id} style={{fontSize:"0.28rem",color:`rgba(255,100,100,${1-i*0.2})`,fontFamily:"Orbitron,monospace",marginTop:4,padding:"2px 5px",borderLeft:"2px solid #FF206040"}}>
                <span style={{color:"#444"}}>{cmd.time} </span>
                <span style={{color:"#FF2060"}}>[{cmd.target}]</span> {cmd.type==="SHAPE"?"⬤ "+cmd.shape:cmd.message}
              </div>
            ))}
          </div>

          <div>
            <PanelLabel color={transmitting?"#00FF88":"#00FFFF"}>TRANSMIT</PanelLabel>
            <div style={{padding:"7px",border:`1px solid ${transmitting?"#00FF8850":"#1a1a1a"}`,background:transmitting?"rgba(0,255,136,0.04)":"transparent",transition:"all 0.3s"}}>
              <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:3}}>
                <PulseDot color={transmitting?"#00FF88":"#333"} active={transmitting} size={6}/>
                <GlowText color={transmitting?"#00FF88":"#444"} size="0.44rem">{transmitting?"TRANSMITTING...":"STANDBY"}</GlowText>
              </div>
              <div style={{fontSize:"0.38rem",color:"#FFD700"}}>LAST: {lastShape}</div>
              <div style={{fontSize:"0.31rem",color:"#333",marginTop:3}}>NRF24L01 · CH 0x5A · 1Mbps</div>
            </div>
          </div>

          <div>
            <div onClick={()=>setShowUsers(v=>!v)} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"7px 10px",cursor:"pointer",background:showUsers?"rgba(255,215,0,0.08)":"rgba(255,215,0,0.03)",border:"1px solid #FFD70040"}}>
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                <div style={{width:5,height:5,borderRadius:"50%",background:"#FFD700",boxShadow:"0 0 7px #FFD700",animation:"pulse 1.5s ease-in-out infinite"}}/>
                <span style={{fontSize:"0.44rem",color:"#FFD700",fontFamily:"Orbitron,monospace",fontWeight:700,textShadow:"0 0 8px #FFD70080"}}>REGISTERED PEOPLE</span>
              </div>
              <span style={{fontSize:"0.44rem",color:"#FFD700",display:"inline-block",transform:showUsers?"rotate(180deg)":"rotate(0deg)",transition:"transform 0.25s"}}>▾</span>
            </div>
            {showUsers&&(
              <div style={{border:"1px solid #FFD70030",borderTop:"none",background:"rgba(0,5,15,0.97)",maxHeight:170,overflowY:"auto"}}>
                {regUsers.length===0
                  ?<div style={{fontSize:"0.36rem",color:"#444",padding:"10px",textAlign:"center",lineHeight:2,fontFamily:"Orbitron,monospace"}}>No faces registered yet.</div>
                  :regUsers.map((u,i)=>(
                    <div key={u.id} style={{display:"flex",alignItems:"center",gap:7,padding:"6px 10px",borderBottom:"1px solid #FFD70015",background:i%2===0?"rgba(255,215,0,0.02)":"transparent"}}>
                      {u.photo?<img src={u.photo} style={{width:26,height:26,objectFit:"cover",flexShrink:0,border:"1px solid #FFD70060"}}/>:<div style={{width:26,height:26,background:"#111",flexShrink:0,border:"1px solid #FFD70030",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"0.8rem"}}>👤</div>}
                      <div style={{overflow:"hidden",flex:1}}>
                        <div style={{fontSize:"0.4rem",color:"#FFD700",fontFamily:"Orbitron,monospace",fontWeight:700,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",textShadow:"0 0 8px #FFD70080"}}>{u.name}</div>
                        <div style={{fontSize:"0.27rem",marginTop:2,fontFamily:"Orbitron,monospace",color:(u.accessCount||0)>0?"#00FF88":"#555"}}>{(u.accessCount||0)>0?`✓ ${u.accessCount} logins`:"No logins yet"}</div>
                      </div>
                      <div style={{width:5,height:5,borderRadius:"50%",flexShrink:0,background:"#00FF88",boxShadow:"0 0 5px #00FF88",animation:"pulse 2s ease-in-out infinite"}}/>
                    </div>
                  ))}
              </div>
            )}
          </div>

          <div style={{marginTop:"auto"}}>
            <PanelLabel>TIPS</PanelLabel>
            {[["Draw ○","Circle"],["Draw □","Square"],["Draw △","Triangle"],["Draw V","V-shape"],["Draw —","Line"],["C key","Change color"]].map(([k,v])=>(
              <div key={k} style={{display:"flex",gap:7,alignItems:"center",marginBottom:4}}>
                <span style={{fontSize:"0.36rem",color:"#FFD700",fontFamily:"Orbitron,monospace",border:"1px solid #FFD70030",padding:"1px 5px",minWidth:48,textAlign:"center"}}>{k}</span>
                <span style={{fontSize:"0.32rem",color:"#555"}}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
