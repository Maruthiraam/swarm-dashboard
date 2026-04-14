import { useState, useEffect, useRef } from "react";

const STORE_KEY       = "swarm_users_v1";
const PIN_KEY         = "swarm_admin_pin";
const DEFAULT_PIN     = "1234";           // first-time default PIN
const MATCH_THRESHOLD = 0.45;
const MODEL_URL       = "https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model";

const sleep = ms => new Promise(r => setTimeout(r, ms));

function loadScript(src) {
  return new Promise((res,rej)=>{
    if(document.querySelector(`script[src="${src}"]`)){res();return;}
    const s=document.createElement("script");
    s.src=src; s.onload=res; s.onerror=rej;
    document.head.appendChild(s);
  });
}
function euclidDist(a,b){
  let s=0; for(let i=0;i<a.length;i++){const d=a[i]-b[i];s+=d*d;} return Math.sqrt(s);
}
function drawBrackets(ctx,x,y,w,h,color,sz=22){
  ctx.strokeStyle=color;ctx.lineWidth=2.5;ctx.shadowColor=color;ctx.shadowBlur=12;
  [[x,y+sz,x,y,x+sz,y],[x+w-sz,y,x+w,y,x+w,y+sz],
   [x,y+h-sz,x,y+h,x+sz,y+h],[x+w-sz,y+h,x+w,y+h,x+w,y+h-sz]
  ].forEach(([x1,y1,x2,y2,x3,y3])=>{
    ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.lineTo(x3,y3);ctx.stroke();
  });
  ctx.shadowBlur=0;
}
function loadUsers(){try{return JSON.parse(localStorage.getItem(STORE_KEY))||[];}catch{return [];}}
function saveUsers(u){localStorage.setItem(STORE_KEY,JSON.stringify(u));}
function getSavedPin(){return localStorage.getItem(PIN_KEY)||DEFAULT_PIN;}

const G=({c="#00FFFF",s="1rem",fw=400,ls="0.1em",children,style={}})=>(
  <span style={{color:c,fontSize:s,fontWeight:fw,fontFamily:"Orbitron,monospace",
    textShadow:`0 0 8px ${c},0 0 25px ${c}50`,letterSpacing:ls,...style}}>{children}</span>
);
const PanelLabel=({children,color="#00FFFF"})=>(
  <div style={{padding:"4px 0",borderBottom:`1px solid ${color}30`,marginBottom:8}}>
    <G c={color} s="0.5rem">[ {children} ]</G>
  </div>
);

export default function FaceAuth({onSuccess}){
  const videoRef  = useRef(null);
  const canvasRef = useRef(null);
  const snapRef   = useRef(null);
  const animRef   = useRef(null);
  const streamRef = useRef(null);
  const readyRef  = useRef(false);

  // view: loading | pin_gate | home | register | scanning | success | reg_success | fail | denied | error
  const [view,          setView]         = useState("loading");
  const [status,        setStatus]       = useState("Initializing...");
  const [loadStep,      setLoadStep]     = useState(0);
  const [scanPct,       setScanPct]      = useState(0);
  const [users,         setUsers]        = useState(loadUsers);
  const [newName,       setNewName]      = useState("");
  const [nameError,     setNameError]    = useState("");
  const [attempts,      setAttempts]     = useState(0);
  const [matchUser,     setMatchUser]    = useState(null);
  const [faceConf,      setFaceConf]     = useState(0);
  const [deleteConfirm, setDeleteConfirm]= useState(null);

  // PIN states
  const [pinInput,      setPinInput]     = useState("");
  const [pinError,      setPinError]     = useState("");
  const [pinAction,     setPinAction]    = useState(""); // "register" | "verify"
  const [showChangePIN, setShowChangePIN]= useState(false);
  const [newPin,        setNewPin]       = useState("");
  const [confirmPin,    setConfirmPin]   = useState("");
  const [pinChangeMsg,  setPinChangeMsg] = useState("");

  // ── Load models ──────────────────────────────────────────────
  useEffect(()=>{
    let cancelled=false;
    const init=async()=>{
      try{
        setStatus("Loading face-api.js..."); setLoadStep(1);
        await loadScript("https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js");
        let tries=0;
        while(!window.faceapi&&tries++<40) await sleep(300);
        if(!window.faceapi) throw new Error("face-api.js failed — check internet");
        const fa=window.faceapi;
        setStatus("Loading detection model..."); setLoadStep(2);
        await fa.nets.ssdMobilenetv1.loadFromUri(MODEL_URL);
        setStatus("Loading recognition model..."); setLoadStep(3);
        await fa.nets.faceRecognitionNet.loadFromUri(MODEL_URL);
        setStatus("Loading landmark model..."); setLoadStep(4);
        await fa.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
        if(cancelled) return;
        readyRef.current=true;
        setLoadStep(5);
        setView("home");
      }catch(e){setStatus("ERR: "+e.message);setView("error");}
    };
    init();
    return()=>{cancelled=true;};
  },[]);

  const startCamera=async()=>{
    if(streamRef.current) return;
    const stream=await navigator.mediaDevices.getUserMedia({video:{width:640,height:480,facingMode:"user"}});
    streamRef.current=stream;
    videoRef.current.srcObject=stream;
    await new Promise(res=>{videoRef.current.onloadeddata=res;setTimeout(res,3000);});
    videoRef.current.play();
  };
  const stopCamera=()=>{
    cancelAnimationFrame(animRef.current);
    streamRef.current?.getTracks().forEach(t=>t.stop());
    streamRef.current=null;
  };
  const capturePhoto=()=>{
    const vid=videoRef.current,cv=snapRef.current;
    if(!vid||!cv) return null;
    cv.width=vid.videoWidth; cv.height=vid.videoHeight;
    const ctx=cv.getContext("2d");
    ctx.translate(cv.width,0); ctx.scale(-1,1);
    ctx.drawImage(vid,0,0); ctx.setTransform(1,0,0,1,0,0);
    return cv.toDataURL("image/jpeg",0.7);
  };

  // ── PIN gate ─────────────────────────────────────────────────
  const handlePinSubmit=()=>{
    const saved=getSavedPin();
    if(pinInput===saved){
      setPinError("");
      setPinInput("");
      if(pinAction==="register") startRegisterFlow();
      else                        startVerifyFlow();
    } else {
      setPinError("Wrong PIN! Try again.");
      setPinInput("");
    }
  };

  const openPinGate=(action)=>{
    setPinAction(action);
    setPinInput("");
    setPinError("");
    setView("pin_gate");
  };

  const handleChangePIN=()=>{
    if(newPin.length<4){setPinChangeMsg("PIN must be at least 4 digits!");return;}
    if(newPin!==confirmPin){setPinChangeMsg("PINs don't match!");return;}
    localStorage.setItem(PIN_KEY,newPin);
    setPinChangeMsg("PIN changed successfully! ✅");
    setNewPin(""); setConfirmPin("");
    setTimeout(()=>{setShowChangePIN(false);setPinChangeMsg("");},1500);
  };

  // ── REGISTER ─────────────────────────────────────────────────
  const goRegister=()=>{
    if(!newName.trim()){setNameError("Enter a name first!");return;}
    if(users.find(u=>u.name.toLowerCase()===newName.trim().toLowerCase())){
      setNameError("Name already registered!");return;
    }
    setNameError("");
    openPinGate("register");
  };

  const startRegisterFlow=async()=>{
    setView("register");
    setStatus("Look at the camera...");
    setScanPct(0);
    await startCamera();
    startRegisterLoop(newName.trim());
  };

  const startRegisterLoop=(name)=>{
    let progress=0,stable=0;
    const loop=async()=>{
      const vid=videoRef.current,cv=canvasRef.current;
      if(!vid||!cv||!readyRef.current){animRef.current=requestAnimationFrame(loop);return;}
      const fa=window.faceapi;
      const W=vid.videoWidth||640,H=vid.videoHeight||480;
      cv.width=W;cv.height=H;
      const ctx=cv.getContext("2d");
      ctx.clearRect(0,0,W,H);
      let det=null;
      try{det=await fa.detectSingleFace(vid,new fa.SsdMobilenetv1Options({minConfidence:0.5}))
        .withFaceLandmarks().withFaceDescriptor();}catch(e){}
      if(det){
        const box=det.detection.box,mx=W-box.x-box.width;
        setFaceConf(Math.round(det.detection.score*100));
        drawBrackets(ctx,mx,box.y,box.width,box.height,"#FFD700");
        ctx.strokeStyle=`rgba(255,215,0,${0.3+progress/150})`;
        ctx.lineWidth=1.5;ctx.strokeRect(mx,box.y,box.width,box.height);
        det.landmarks.positions.forEach(pt=>{
          ctx.beginPath();ctx.arc(W-pt.x,pt.y,1.5,0,Math.PI*2);
          ctx.fillStyle="rgba(255,215,0,0.7)";ctx.fill();
        });
        const sy=box.y+(box.height*((progress%100)/100));
        ctx.beginPath();ctx.moveTo(mx,sy);ctx.lineTo(mx+box.width,sy);
        ctx.strokeStyle="rgba(255,215,0,0.9)";ctx.lineWidth=1.5;
        ctx.shadowColor="#FFD700";ctx.shadowBlur=8;ctx.stroke();ctx.shadowBlur=0;
        stable++;
        if(stable>8){progress=Math.min(100,progress+2);setScanPct(Math.round(progress));}
        if(progress>=100){
          cancelAnimationFrame(animRef.current);
          const photo=capturePhoto();
          const newUser={
            id:Date.now(),name,photo,
            descriptor:Array.from(det.descriptor),
            registeredAt:new Date().toLocaleString(),
            accessCount:0,
          };
          const updated=[...loadUsers(),newUser];
          saveUsers(updated);setUsers(updated);setNewName("");
          setStatus(`✅ ${name} registered!`);
          setView("reg_success");
          stopCamera();
          setTimeout(()=>setView("home"),2000);
          return;
        }
      } else {
        // FREEZE — no decrease
        stable=0;setFaceConf(0);
      }
      animRef.current=requestAnimationFrame(loop);
    };
    animRef.current=requestAnimationFrame(loop);
  };

  // ── VERIFY ───────────────────────────────────────────────────
  const goVerify=()=>{
    if(users.length===0) return;
    openPinGate("verify");
  };

  const startVerifyFlow=async()=>{
    setView("scanning");
    setStatus("Place your face in the frame...");
    setAttempts(0);setScanPct(0);setMatchUser(null);
    await startCamera();
    startVerifyLoop(0);
  };

  const startVerifyLoop=(attemptsCount)=>{
    let progress=0,stable=0;
    const loop=async()=>{
      const vid=videoRef.current,cv=canvasRef.current;
      if(!vid||!cv||!readyRef.current){animRef.current=requestAnimationFrame(loop);return;}
      const fa=window.faceapi;
      const W=vid.videoWidth||640,H=vid.videoHeight||480;
      cv.width=W;cv.height=H;
      const ctx=cv.getContext("2d");
      ctx.clearRect(0,0,W,H);
      let det=null;
      try{det=await fa.detectSingleFace(vid,new fa.SsdMobilenetv1Options({minConfidence:0.5}))
        .withFaceLandmarks().withFaceDescriptor();}catch(e){}
      if(det){
        const box=det.detection.box,mx=W-box.x-box.width;
        setFaceConf(Math.round(det.detection.score*100));
        drawBrackets(ctx,mx,box.y,box.width,box.height,"#00FFFF");
        ctx.strokeStyle=`rgba(0,255,255,${0.3+progress/150})`;
        ctx.lineWidth=1.5;ctx.strokeRect(mx,box.y,box.width,box.height);
        det.landmarks.positions.forEach(pt=>{
          ctx.beginPath();ctx.arc(W-pt.x,pt.y,1.5,0,Math.PI*2);
          ctx.fillStyle="rgba(0,255,200,0.6)";ctx.fill();
        });
        const sy=box.y+(box.height*((progress%100)/100));
        ctx.beginPath();ctx.moveTo(mx,sy);ctx.lineTo(mx+box.width,sy);
        ctx.strokeStyle="rgba(0,255,255,0.9)";ctx.lineWidth=1.5;
        ctx.shadowColor="#00FFFF";ctx.shadowBlur=8;ctx.stroke();ctx.shadowBlur=0;
        stable++;
        if(stable>8){progress=Math.min(100,progress+2);setScanPct(Math.round(progress));}
        if(progress>=100){
          cancelAnimationFrame(animRef.current);
          const currentUsers=loadUsers();
          let bestMatch=null,bestDist=Infinity;
          currentUsers.forEach(u=>{
            const dist=euclidDist(det.descriptor,new Float32Array(u.descriptor));
            if(dist<bestDist){bestDist=dist;bestMatch=u;}
          });
          if(bestDist<MATCH_THRESHOLD){
            const updated=currentUsers.map(u=>
              u.id===bestMatch.id
                ?{...u,accessCount:(u.accessCount||0)+1,lastAccess:new Date().toLocaleString()}
                :u
            );
            saveUsers(updated);setUsers(updated);
            setMatchUser(bestMatch);
            setStatus(`ACCESS GRANTED — Welcome, ${bestMatch.name}!`);
            setView("success");
            stopCamera();
            setTimeout(()=>onSuccess(),2500);
          } else {
            const next=attemptsCount+1;
            setAttempts(next);
            if(next>=3){
              setView("denied");
              setStatus("ACCESS DENIED — MAX ATTEMPTS");
              stopCamera();
            } else {
              setView("fail");
              setStatus(`Not recognized — ${3-next} attempt${3-next>1?"s":""} left`);
              await sleep(2000);
              progress=0;stable=0;setScanPct(0);
              setView("scanning");
              setStatus("Place your face in the frame...");
              loop();
            }
          }
          return;
        }
      } else {
        // FREEZE — no decrease
        stable=0;setFaceConf(0);
      }
      animRef.current=requestAnimationFrame(loop);
    };
    animRef.current=requestAnimationFrame(loop);
  };

  const deleteUser=(id)=>{
    const updated=users.filter(u=>u.id!==id);
    saveUsers(updated);setUsers(updated);setDeleteConfirm(null);
  };
  const goHome=()=>{
    stopCamera();
    setView("home");setScanPct(0);setFaceConf(0);
    setNameError("");setAttempts(0);
  };

  const VC={
    loading:"#00FFFF",home:"#00FFFF",pin_gate:"#FFD700",
    register:"#FFD700",reg_success:"#00FF88",scanning:"#00FFFF",
    success:"#00FF88",fail:"#FF2060",denied:"#FF2060",error:"#FF2060",
  };
  const col=VC[view]||"#00FFFF";
  const now=new Date();
  const STEPS=["face-api.js","Detection","Recognition","Landmarks","Ready"];
  const isFirstPin=!localStorage.getItem(PIN_KEY);

  return(
    <div style={{width:"100vw",height:"100vh",background:"#020810",
      display:"flex",flexDirection:"column",fontFamily:"Orbitron,monospace",
      overflow:"hidden",position:"relative"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&display=swap');
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}
        @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
        @keyframes scanLine{0%{top:0}100%{top:100%}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
        @keyframes shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-8px)}75%{transform:translateX(8px)}}
        @keyframes glowPulse{0%,100%{opacity:0.5}50%{opacity:1}}
        @keyframes pinpop{0%{transform:scale(0.8);opacity:0}100%{transform:scale(1);opacity:1}}
        input{background:transparent;border:1px solid #00FFFF40;color:#fff;
          padding:8px 12px;font-family:Orbitron,monospace;font-size:0.55rem;
          outline:none;width:100%;letter-spacing:0.1em;}
        input::placeholder{color:#333}
        input:focus{border-color:#00FFFF;box-shadow:0 0 10px #00FFFF30}
        button{cursor:pointer;font-family:Orbitron,monospace;letter-spacing:0.08em;transition:all 0.2s}
        *{box-sizing:border-box}
        ::-webkit-scrollbar{width:3px;background:#020810}
        ::-webkit-scrollbar-thumb{background:#00FFFF30}
      `}</style>

      {/* BG */}
      <div style={{position:"absolute",inset:0,opacity:0.04,
        backgroundImage:`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='56' height='100'%3E%3Cpath d='M28 66L0 50V16L28 0l28 16v34L28 66zm0-2l26-15V18L28 2 2 18v31l26 15z' fill='%2300FFFF'/%3E%3C/svg%3E")`,
        backgroundSize:"56px 100px"}}/>
      <div style={{position:"absolute",inset:0,pointerEvents:"none",
        backgroundImage:"repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,255,255,0.02) 2px,rgba(0,255,255,0.02) 4px)"}}/>

      {/* TOP BAR */}
      <div style={{height:50,background:"rgba(0,10,20,0.97)",
        borderBottom:"1px solid #00FFFF20",flexShrink:0,
        display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 24px"}}>
        <G c="#00FFFF" s="0.55rem">SWARM PROTOCOL v2.1</G>
        <G c="#00FFFF" s="0.9rem" fw={900} ls="0.2em">⬡ BIOMETRIC SECURITY GATE</G>
        <G c="#00FF88" s="0.5rem">{now.toLocaleTimeString("en-US",{hour12:false})}</G>
      </div>

      {/* BODY */}
      <div style={{flex:1,display:"flex",overflow:"hidden"}}>

        {/* LEFT — Registered Users */}
        <div style={{width:220,flexShrink:0,background:"rgba(0,5,15,0.92)",
          borderRight:"1px solid #00FFFF15",padding:14,
          display:"flex",flexDirection:"column",gap:10,overflow:"auto"}}>
          <PanelLabel>REGISTERED USERS</PanelLabel>
          <div style={{fontSize:"0.38rem",color:"#555",marginTop:-4,marginBottom:2}}>
            {users.length} user{users.length!==1?"s":""} registered
          </div>
          {users.length===0&&(
            <div style={{fontSize:"0.38rem",color:"#333",padding:"8px 0"}}>
              No users yet. Register a face to begin.
            </div>
          )}
          {users.map((u,i)=>(
            <div key={u.id} style={{border:"1px solid #00FFFF20",background:"rgba(0,255,255,0.03)",padding:"8px 10px"}}>
              <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:5}}>
                {u.photo
                  ?<img src={u.photo} style={{width:36,height:36,objectFit:"cover",border:"1px solid #00FFFF30",flexShrink:0}}/>
                  :<div style={{width:36,height:36,background:"#111",border:"1px solid #00FFFF20",
                    display:"flex",alignItems:"center",justifyContent:"center",fontSize:"1.2rem",flexShrink:0}}>👤</div>}
                <div style={{overflow:"hidden"}}>
                  <G c="#00FFFF" s="0.5rem" fw={700}
                    style={{display:"block",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{u.name}</G>
                  <div style={{fontSize:"0.3rem",color:"#444",marginTop:2}}>{u.registeredAt}</div>
                </div>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{fontSize:"0.35rem",color:"#00FF88"}}>
                  ✓ {u.accessCount||0} login{(u.accessCount||0)!==1?"s":""}
                </span>
                {deleteConfirm===u.id?(
                  <div style={{display:"flex",gap:4}}>
                    <button onClick={()=>deleteUser(u.id)} style={{background:"#FF206020",border:"1px solid #FF2060",color:"#FF2060",padding:"2px 7px",fontSize:"0.32rem"}}>YES</button>
                    <button onClick={()=>setDeleteConfirm(null)} style={{background:"transparent",border:"1px solid #333",color:"#555",padding:"2px 7px",fontSize:"0.32rem"}}>NO</button>
                  </div>
                ):(
                  <button onClick={()=>setDeleteConfirm(u.id)} style={{background:"transparent",border:"1px solid #FF206040",color:"#FF206070",padding:"2px 8px",fontSize:"0.32rem"}}>✕</button>
                )}
              </div>
            </div>
          ))}
          <div style={{marginTop:"auto",borderTop:"1px solid #00FFFF15",paddingTop:10}}>
            {/* Change PIN button */}
            <button onClick={()=>setShowChangePIN(v=>!v)} style={{
              width:"100%",padding:"7px",marginBottom:8,
              background:"rgba(255,215,0,0.05)",border:"1px solid #FFD70030",
              color:"#FFD70090",fontSize:"0.38rem"}}>
              🔑 CHANGE PIN
            </button>
            {showChangePIN&&(
              <div style={{background:"rgba(0,10,20,0.9)",border:"1px solid #FFD70030",padding:10,marginBottom:8}}>
                <div style={{fontSize:"0.36rem",color:"#FFD700",marginBottom:6}}>NEW PIN:</div>
                <input type="password" value={newPin} onChange={e=>setNewPin(e.target.value)}
                  placeholder="New PIN..." style={{marginBottom:6,fontSize:"0.45rem",padding:"6px 10px"}}/>
                <input type="password" value={confirmPin} onChange={e=>setConfirmPin(e.target.value)}
                  placeholder="Confirm PIN..." style={{marginBottom:6,fontSize:"0.45rem",padding:"6px 10px"}}/>
                {pinChangeMsg&&<div style={{fontSize:"0.36rem",color:pinChangeMsg.includes("✅")?"#00FF88":"#FF2060",marginBottom:6}}>{pinChangeMsg}</div>}
                <button onClick={handleChangePIN} style={{
                  width:"100%",padding:"6px",background:"rgba(255,215,0,0.1)",
                  border:"1px solid #FFD70050",color:"#FFD700",fontSize:"0.38rem"}}>
                  SAVE PIN
                </button>
              </div>
            )}
            <div style={{fontSize:"0.33rem",color:"#333",lineHeight:1.8}}>
              Face data stored locally.<br/>Never sent to any server.
            </div>
            {users.length>0&&(
              <button onClick={()=>{if(window.confirm("Delete ALL registered faces?")){saveUsers([]);setUsers([]);}}}
                style={{marginTop:8,background:"rgba(255,32,96,0.04)",border:"1px solid #FF206035",
                  color:"#FF206070",padding:"6px",fontSize:"0.36rem",width:"100%"}}>
                🗑 CLEAR ALL
              </button>
            )}
          </div>
        </div>

        {/* CENTER */}
        <div style={{flex:1,display:"flex",flexDirection:"column",
          alignItems:"center",justifyContent:"center",padding:20,gap:16,position:"relative"}}>

          {/* ── PIN GATE VIEW ── */}
          {view==="pin_gate"&&(
            <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:20,
              animation:"pinpop 0.3s ease"}}>
              <div style={{textAlign:"center"}}>
                <div style={{fontSize:"3rem",marginBottom:8}}>🔑</div>
                <G c="#FFD700" s="1.2rem" fw={900} ls="0.2em">
                  {pinAction==="register"?"REGISTER":"VERIFY"} — ENTER PIN
                </G>
                <div style={{fontSize:"0.42rem",color:"#FFD70060",marginTop:6,fontFamily:"Orbitron,monospace"}}>
                  {isFirstPin?"DEFAULT PIN IS: 1234":"Enter your security PIN to continue"}
                </div>
              </div>

              {/* PIN dots display */}
              <div style={{display:"flex",gap:14,marginBottom:4}}>
                {[0,1,2,3,4,5].map(i=>(
                  <div key={i} style={{
                    width:18,height:18,borderRadius:"50%",
                    background:pinInput.length>i?"#FFD700":"transparent",
                    border:`2px solid ${pinInput.length>i?"#FFD700":"#FFD70040"}`,
                    boxShadow:pinInput.length>i?"0 0 10px #FFD700":"none",
                    transition:"all 0.15s",
                  }}/>
                ))}
              </div>

              {/* Number pad */}
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,width:220}}>
                {[1,2,3,4,5,6,7,8,9,"⌫",0,"✓"].map((k)=>(
                  <button key={k} onClick={()=>{
                    if(k==="⌫") setPinInput(p=>p.slice(0,-1));
                    else if(k==="✓") handlePinSubmit();
                    else if(pinInput.length<6) setPinInput(p=>p+k);
                  }} style={{
                    padding:"14px 0",
                    background:k==="✓"?"rgba(0,255,136,0.12)":k==="⌫"?"rgba(255,32,96,0.1)":"rgba(255,215,0,0.06)",
                    border:`1px solid ${k==="✓"?"#00FF8850":k==="⌫"?"#FF206050":"#FFD70030"}`,
                    color:k==="✓"?"#00FF88":k==="⌫"?"#FF2060":"#FFD700",
                    fontSize:"0.9rem",fontFamily:"Orbitron,monospace",
                    borderRadius:4,
                  }}>
                    {k}
                  </button>
                ))}
              </div>

              {pinError&&(
                <div style={{fontSize:"0.45rem",color:"#FF2060",fontFamily:"Orbitron,monospace",
                  animation:"shake 0.3s ease"}}>
                  ⚠ {pinError}
                </div>
              )}

              <button onClick={()=>setView("home")} style={{
                background:"transparent",border:"1px solid #333",
                color:"#555",padding:"6px 24px",fontSize:"0.42rem"}}>← CANCEL</button>
            </div>
          )}

          {/* ── HOME VIEW ── */}
          {view==="home"&&(
            <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:24,animation:"fadeUp 0.6s ease"}}>
              <G c="#00FFFF" s="1.5rem" fw={900} ls="0.2em">SWARM ACCESS</G>
              <div style={{fontSize:"0.45rem",color:"#00FFFF50",letterSpacing:"0.3em"}}>
                FACIAL RECOGNITION AUTHENTICATION
              </div>

              <button onClick={()=>goVerify()} disabled={users.length===0} style={{
                width:340,padding:"18px 0",
                background:users.length>0?"rgba(0,255,255,0.07)":"rgba(0,0,0,0.3)",
                border:`2px solid ${users.length>0?"#00FFFF60":"#222"}`,
                color:users.length>0?"#00FFFF":"#333",
                fontSize:"0.75rem",letterSpacing:"0.15em",
                boxShadow:users.length>0?"0 0 30px #00FFFF15":"none",
              }}>
                👁 SCAN &amp; VERIFY FACE
              </button>
              {users.length===0&&(
                <div style={{fontSize:"0.4rem",color:"#FF2060",fontFamily:"Orbitron,monospace"}}>
                  ⚠ No users registered — register a face first!
                </div>
              )}

              <div style={{display:"flex",alignItems:"center",gap:12,width:340}}>
                <div style={{flex:1,height:1,background:"#00FFFF15"}}/>
                <G c="#333" s="0.4rem">OR</G>
                <div style={{flex:1,height:1,background:"#00FFFF15"}}/>
              </div>

              <div style={{width:340,display:"flex",flexDirection:"column",gap:10}}>
                <G c="#FFD700" s="0.5rem">REGISTER NEW FACE</G>
                <input value={newName}
                  onChange={e=>{setNewName(e.target.value);setNameError("");}}
                  onKeyDown={e=>e.key==="Enter"&&goRegister()}
                  placeholder="Enter your name..." maxLength={24}/>
                {nameError&&<div style={{fontSize:"0.4rem",color:"#FF2060",fontFamily:"Orbitron,monospace"}}>⚠ {nameError}</div>}
                <button onClick={goRegister} style={{
                  width:"100%",padding:"12px 0",
                  background:"rgba(255,215,0,0.06)",border:"1px solid #FFD70050",
                  color:"#FFD700",fontSize:"0.6rem",letterSpacing:"0.12em",
                }}>+ REGISTER FACE</button>
              </div>
            </div>
          )}

          {/* ── LOADING ── */}
          {view==="loading"&&(
            <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:16}}>
              <div style={{width:52,height:52,borderRadius:"50%",border:"2px solid #00FFFF18",
                borderTop:"2px solid #00FFFF",animation:"spin 1s linear infinite"}}/>
              <G c="#00FFFF" s="0.65rem">{status}</G>
              <div style={{display:"flex",flexDirection:"column",gap:6,width:260}}>
                {STEPS.map((step,i)=>(
                  <div key={i} style={{display:"flex",alignItems:"center",gap:8}}>
                    <div style={{width:7,height:7,borderRadius:"50%",flexShrink:0,
                      background:loadStep>i?"#00FF88":loadStep===i?"#00FFFF":"#1a1a1a",
                      boxShadow:loadStep>i?"0 0 6px #00FF88":loadStep===i?"0 0 8px #00FFFF":"none",
                      animation:loadStep===i?"pulse 0.8s ease-in-out infinite":"none"}}/>
                    <G c={loadStep>i?"#00FF88":loadStep===i?"#00FFFF":"#2a2a2a"} s="0.4rem">{step}</G>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── CAMERA VIEWS ── */}
          {["register","scanning","fail","success","reg_success","denied"].includes(view)&&(
            <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:14,animation:"fadeUp 0.4s ease"}}>
              <div style={{position:"relative",width:480,height:360,
                border:`2px solid ${col}35`,boxShadow:`0 0 40px ${col}18`,
                animation:view==="denied"?"shake 0.4s ease 3":"none"}}>
                {["tl","tr","bl","br"].map(pos=>(
                  <div key={pos} style={{position:"absolute",zIndex:10,
                    top:pos.startsWith("t")?0:"auto",bottom:pos.startsWith("b")?0:"auto",
                    left:pos.endsWith("l")?0:"auto",right:pos.endsWith("r")?0:"auto",
                    width:28,height:28,
                    borderTop:pos.startsWith("t")?`3px solid ${col}`:"none",
                    borderBottom:pos.startsWith("b")?`3px solid ${col}`:"none",
                    borderLeft:pos.endsWith("l")?`3px solid ${col}`:"none",
                    borderRight:pos.endsWith("r")?`3px solid ${col}`:"none",
                    boxShadow:`0 0 10px ${col}60`,transition:"all 0.4s",pointerEvents:"none"}}/>
                ))}
                <video ref={videoRef} style={{width:"100%",height:"100%",display:"block",
                  objectFit:"cover",transform:"scaleX(-1)",filter:"brightness(0.85) contrast(1.1)"}} muted playsInline/>
                <canvas ref={canvasRef} style={{position:"absolute",top:0,left:0,width:"100%",height:"100%"}}/>
                {(view==="register"||view==="scanning")&&(
                  <div style={{position:"absolute",left:0,right:0,height:2,pointerEvents:"none",
                    background:`linear-gradient(90deg,transparent 10%,${col} 50%,transparent 90%)`,
                    animation:"scanLine 2.5s linear infinite",boxShadow:`0 0 12px ${col}`}}/>
                )}
                {view==="success"&&(
                  <div style={{position:"absolute",inset:0,background:"rgba(0,255,136,0.12)",
                    border:"3px solid #00FF88",display:"flex",flexDirection:"column",
                    alignItems:"center",justifyContent:"center",gap:10}}>
                    <div style={{fontSize:"3rem"}}>✅</div>
                    <G c="#00FF88" s="1rem" fw={900}>ACCESS GRANTED</G>
                    {matchUser?.photo&&<img src={matchUser.photo} style={{width:60,height:60,objectFit:"cover",border:"2px solid #00FF88",borderRadius:"50%"}}/>}
                    {matchUser&&<G c="#00FF88" s="0.75rem">Welcome, {matchUser.name}!</G>}
                  </div>
                )}
                {view==="reg_success"&&(
                  <div style={{position:"absolute",inset:0,background:"rgba(0,255,136,0.1)",
                    border:"3px solid #00FF88",display:"flex",flexDirection:"column",
                    alignItems:"center",justifyContent:"center",gap:10}}>
                    <div style={{fontSize:"3rem"}}>💾</div>
                    <G c="#00FF88" s="1rem" fw={900}>FACE SAVED!</G>
                  </div>
                )}
                {view==="fail"&&(
                  <div style={{position:"absolute",inset:0,background:"rgba(255,32,96,0.12)",
                    border:"2px solid #FF2060",display:"flex",flexDirection:"column",
                    alignItems:"center",justifyContent:"center",gap:10}}>
                    <div style={{fontSize:"3rem"}}>❌</div>
                    <G c="#FF2060" s="0.9rem" fw={900}>NOT RECOGNIZED</G>
                  </div>
                )}
                {view==="denied"&&(
                  <div style={{position:"absolute",inset:0,background:"rgba(255,32,96,0.18)",
                    border:"3px solid #FF2060",display:"flex",flexDirection:"column",
                    alignItems:"center",justifyContent:"center",gap:12}}>
                    <div style={{fontSize:"3rem"}}>🚫</div>
                    <G c="#FF2060" s="1rem" fw={900}>ACCESS DENIED</G>
                    <button onClick={goHome} style={{marginTop:8,background:"transparent",
                      border:"1px solid #FF2060",color:"#FF2060",padding:"8px 22px",fontSize:"0.5rem"}}>↺ GO BACK</button>
                  </div>
                )}
              </div>
              <G c={col} s="0.65rem" fw={700}>{status}</G>
              {(view==="register"||view==="scanning")&&(
                <div style={{width:480}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
                    <G c="#555" s="0.38rem">{view==="register"?"CAPTURING FACE DATA":"VERIFYING IDENTITY"}</G>
                    <G c={col} s="0.38rem">{scanPct}% | CONF: {faceConf}%</G>
                  </div>
                  <div style={{background:"#0a0a0a",height:8,borderRadius:4,overflow:"hidden",border:"1px solid #ffffff10"}}>
                    <div style={{height:"100%",width:`${scanPct}%`,
                      background:`linear-gradient(90deg,${col}60,${col})`,
                      transition:"width 0.08s ease",boxShadow:`0 0 12px ${col}`,borderRadius:4}}/>
                  </div>
                  <div style={{fontSize:"0.35rem",color:"#555",textAlign:"center",marginTop:6,fontFamily:"Orbitron,monospace"}}>
                    PROGRESS FREEZES WHEN YOU LOOK AWAY
                  </div>
                </div>
              )}
              {(view==="register"||view==="scanning")&&(
                <button onClick={goHome} style={{background:"transparent",border:"1px solid #333",color:"#555",padding:"6px 20px",fontSize:"0.42rem"}}>← BACK</button>
              )}
            </div>
          )}

          {view==="error"&&(
            <div style={{textAlign:"center",display:"flex",flexDirection:"column",gap:14,alignItems:"center"}}>
              <div style={{fontSize:"3rem"}}>⚠️</div>
              <G c="#FF2060" s="0.7rem">SYSTEM ERROR</G>
              <G c="#FF206070" s="0.45rem" style={{maxWidth:360}}>{status}</G>
              <button onClick={()=>window.location.reload()} style={{background:"transparent",border:"1px solid #FF2060",color:"#FF2060",padding:"8px 22px",fontSize:"0.5rem"}}>↺ RELOAD</button>
            </div>
          )}

          <canvas ref={snapRef} style={{display:"none"}}/>
        </div>

        {/* RIGHT — Access Log */}
        <div style={{width:220,flexShrink:0,background:"rgba(0,5,15,0.92)",
          borderLeft:"1px solid #00FFFF15",padding:14,
          display:"flex",flexDirection:"column",gap:12,overflow:"auto"}}>
          <PanelLabel>ACCESS LOG</PanelLabel>
          {users.filter(u=>u.accessCount>0).length===0?(
            <div style={{fontSize:"0.38rem",color:"#333"}}>No access events yet</div>
          ):(
            users.filter(u=>u.accessCount>0)
              .sort((a,b)=>(b.accessCount||0)-(a.accessCount||0))
              .map(u=>(
                <div key={u.id} style={{display:"flex",gap:8,alignItems:"center",marginBottom:8,borderBottom:"1px solid #00FFFF10",paddingBottom:8}}>
                  {u.photo&&<img src={u.photo} style={{width:28,height:28,objectFit:"cover",border:"1px solid #00FF8840",flexShrink:0}}/>}
                  <div>
                    <G c="#00FF88" s="0.45rem" fw={700}>{u.name}</G>
                    <div style={{fontSize:"0.32rem",color:"#444",marginTop:2}}>{u.accessCount} login{u.accessCount!==1?"s":""}</div>
                    {u.lastAccess&&<div style={{fontSize:"0.28rem",color:"#333",marginTop:1}}>{u.lastAccess}</div>}
                  </div>
                </div>
              ))
          )}
          <div style={{marginTop:12}}>
            <PanelLabel>SECURITY INFO</PanelLabel>
            {[["USERS",`${users.length} registered`],["MODEL","SSD MobileNet"],
              ["FEATURES","128-dim"],["MATCH",`≤${(MATCH_THRESHOLD*100).toFixed(0)}% dist`],
              ["PIN","Protected ✓"]].map(([k,v])=>(
              <div key={k} style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
                <span style={{fontSize:"0.36rem",color:"#444"}}>{k}</span>
                <span style={{fontSize:"0.36rem",color:"#888"}}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
