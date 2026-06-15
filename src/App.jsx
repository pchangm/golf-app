import { useState, useEffect, useCallback } from "react";
import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc, setDoc, deleteDoc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCTUDnNlKZ9YX8vyFypDzqfzi2rnLDeQDo",
  authDomain: "golf-scorecard-9c81f.firebaseapp.com",
  projectId: "golf-scorecard-9c81f",
  storageBucket: "golf-scorecard-9c81f.firebasestorage.app",
  messagingSenderId: "489428862760",
  appId: "1:489428862760:web:6da649cb9ae9f6f23c721d"
};
const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);

// Firebase storage helpers replacing window.storage
const fbGet = async (key) => {
  try {
    const snap = await getDoc(doc(db, "golf", key));
    return snap.exists() ? { value: snap.data().value } : null;
  } catch(e) { return null; }
};
const fbSet = async (key, value) => {
  try { await setDoc(doc(db, "golf", key), { value }); } catch(e) {}
};
const fbDelete = async (key) => {
  try { await deleteDoc(doc(db, "golf", key)); } catch(e) {}
};

const STORAGE_KEY = "golf-scorecard-session";
const COURSES_KEY = "golf-courses-library";
const HISTORY_KEY = "golf-rounds-history";
const PLAYERS_KEY = "golf-players-library";
const DEFAULT_COURSE_KEY = "golf-default-course";
const PAR_OPTIONS = [3, 4, 5];
const SI_OPTIONS = Array.from({ length: 18 }, (_, i) => i + 1);
const DEFAULT_HOLES = Array.from({ length: 18 }, (_, i) => ({
  number: i + 1,
  par: i % 3 === 0 ? 3 : i % 3 === 1 ? 4 : 5,
  si: i + 1,
}));

function effectiveHcp(handicap, pct) {
  return Math.round(handicap * ((pct ?? 100) / 100));
}
function calcStableford(strokes, par, si, handicap) {
  if (!strokes || strokes === 0) return null;
  const shots = Math.floor(handicap / 18) + (si <= (handicap % 18) ? 1 : 0);
  return Math.max(0, 2 - (strokes - par - shots));
}
function totalStableford(scores, holes, handicap) {
  return holes.reduce((acc, hole) => {
    const s = scores[hole.number];
    return acc + (s ? (calcStableford(s, hole.par, hole.si, handicap) ?? 0) : 0);
  }, 0);
}

// ─── Confirm Dialog ───────────────────────────────────────────────────────────
function ConfirmDialog({ message, onConfirm, onCancel }) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="confirm-box" onClick={e => e.stopPropagation()}>
        <p>{message}</p>
        <div className="confirm-actions">
          <button className="btn-ghost" onClick={onCancel}>Cancelar</button>
          <button className="btn-danger" onClick={onConfirm}>Sí, continuar</button>
        </div>
      </div>
    </div>
  );
}

// ─── History Modal ────────────────────────────────────────────────────────────
function HistoryModal({ history, onClose, onRestore, onDeleteRound }) {
  const [detail, setDetail] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);

  if (detail) {
    const { session } = detail;
    const leaderboard = session.players
      .map(p => ({
        ...p,
        total: totalStableford(session.scores?.[p.id] || {}, session.holes, p.handicap),
        strokes: session.holes.reduce((a, h) => a + ((session.scores?.[p.id] || {})[h.number] || 0), 0),
      }))
      .sort((a, b) => b.total - a.total);
    return (
      <div className="modal-overlay" onClick={() => setDetail(null)}>
        <div className="modal-box" onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <h2>📄 {session.roundName}</h2>
            <button className="btn-icon" onClick={() => setDetail(null)}>←</button>
          </div>
          <div className="modal-body">
            <div className="hist-meta">{session.courseName && <span>📍 {session.courseName}</span>}<span>🗓 {detail.savedAt}</span></div>
            <div className="hist-leaderboard">
              {leaderboard.map((p, i) => (
                <div key={p.id} className={`lb-row ${i===0?"leader":""}`}>
                  <div className="lb-rank">{i===0?"🏆":i+1}</div>
                  <div className="lb-info">
                    <div className="lb-name">{p.name}</div>
                    <div className="lb-sub">HCP {p.handicap} · {p.strokes} golpes</div>
                  </div>
                  <div className="lb-pts">{p.total} <span>pts</span></div>
                </div>
              ))}
            </div>
            <div className="edit-footer" style={{marginTop:16}}>
              <button className="btn-danger small" onClick={() => { onDeleteRound(detail.id); setDetail(null); }}>Eliminar ronda</button>
              <button className="btn-primary inline" onClick={() => { onRestore(session); onClose(); }}>Continuar esta ronda</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>🕓 Historial de rondas</h2>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {history.length === 0 && (
            <div className="empty-state">
              <div style={{fontSize:"2.5rem"}}>📋</div>
              <p>No hay rondas guardadas aún.</p>
              <p style={{fontSize:"0.8rem",color:"var(--muted)"}}>Las rondas se guardan automáticamente al finalizar.</p>
            </div>
          )}
          <div className="course-list">
            {history.map(r => (
              <div key={r.id} className="course-card">
                <div className="course-card-info" style={{cursor:"pointer"}} onClick={() => setDetail(r)}>
                  <div className="course-card-name">{r.session.roundName}</div>
                  <div className="course-card-sub">
                    {r.session.courseName && <span>📍 {r.session.courseName} · </span>}
                    {r.session.players.length} jugadores · {r.savedAt}
                  </div>
                </div>
                <div className="course-card-actions">
                  <button className="btn-mini green" onClick={() => setDetail(r)}>Ver</button>
                  <button className="btn-mini green" onClick={() => { onRestore(r.session); onClose(); }}>Continuar</button>
                  {confirmDel === r.id
                    ? <><button className="btn-mini red" onClick={() => { onDeleteRound(r.id); setConfirmDel(null); }}>¿Eliminar?</button><button className="btn-mini" onClick={() => setConfirmDel(null)}>No</button></>
                    : <button className="btn-mini red-ghost" onClick={() => setConfirmDel(r.id)}>✕</button>
                  }
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}


// ─── Player Manager ──────────────────────────────────────────────────────────
function PlayerManager({ savedPlayers, onSave, onDelete, onClose, onPick }) {
  const [view, setView] = useState("list");
  const [editing, setEditing] = useState(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [handicap, setHandicap] = useState(18);
  const [confirmDel, setConfirmDel] = useState(null);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("firstName");

  const openNew = () => { setEditing(null); setFirstName(""); setLastName(""); setHandicap(18); setView("edit"); };
  const openEdit = (pl) => { setEditing(pl.id); setFirstName(pl.firstName); setLastName(pl.lastName||""); setHandicap(pl.handicap); setView("edit"); };
  const handleSave = () => {
    if (!firstName.trim()) return;
    onSave({ id: editing||("pl-"+Date.now()), firstName:firstName.trim(), lastName:lastName.trim(), handicap, updatedAt:new Date().toLocaleDateString("es-ES") });
    setView("list");
  };
  const filtered = savedPlayers
    .filter(p => (p.firstName+" "+p.lastName).toLowerCase().includes(search.toLowerCase()))
    .sort((a,b) => (a[sortBy]||"").localeCompare(b[sortBy]||""));

  return (
    <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal-box">
        <div className="modal-header">
          <h2>{view==="list"?"👤 Jugadores guardados":(editing?"Editar jugador":"Nuevo jugador")}</h2>
          <button className="btn-icon" onClick={onClose}>X</button>
        </div>
        {view==="list" && (
          <div className="modal-body">
            <div className="modal-actions-top">
              <button className="btn-ghost" onClick={openNew}>+ Nuevo jugador</button>
            </div>
            <input className="text-input" style={{marginBottom:8}} placeholder="Buscar..." value={search} onChange={e=>setSearch(e.target.value)}/>
            <div className="sort-row">
              <span className="sort-label">Ordenar:</span>
              <button className={"btn-mini"+(sortBy==="firstName"?" active-sort":"")} onClick={()=>setSortBy("firstName")}>Nombre</button>
              <button className={"btn-mini"+(sortBy==="lastName"?" active-sort":"")} onClick={()=>setSortBy("lastName")}>Apellido</button>
            </div>
            {filtered.length===0 && <div className="empty-state"><div style={{fontSize:"2rem"}}>👤</div><p>No hay jugadores guardados.</p></div>}
            <div className="course-list">
              {filtered.map(pl=>(
                <div key={pl.id} className="course-card">
                  <div className="course-card-info">
                    <div className="course-card-name">{pl.firstName} {pl.lastName}</div>
                    <div className="course-card-sub">HCP {pl.handicap} · {pl.updatedAt}</div>
                  </div>
                  <div className="course-card-actions">
                    {onPick && <button className="btn-mini green" onClick={()=>{onPick(pl);onClose();}}>Agregar</button>}
                    <button className="btn-mini" onClick={()=>openEdit(pl)}>Editar</button>
                    {confirmDel===pl.id
                      ? <><button className="btn-mini red" onClick={()=>{onDelete(pl.id);setConfirmDel(null);}}>Eliminar</button><button className="btn-mini" onClick={()=>setConfirmDel(null)}>No</button></>
                      : <button className="btn-mini red-ghost" onClick={()=>setConfirmDel(pl.id)}>X</button>
                    }
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {view==="edit" && (
          <div className="modal-body">
            <div className="edit-fields">
              <div><label className="field-label">Nombre *</label><input className="text-input" value={firstName} onChange={e=>setFirstName(e.target.value)} placeholder="Nombre"/></div>
              <div><label className="field-label">Apellido</label><input className="text-input" value={lastName} onChange={e=>setLastName(e.target.value)} placeholder="Apellido"/></div>
              <div><label className="field-label">Handicap</label><input type="number" className="number-input" min={0} max={54} value={handicap} onChange={e=>setHandicap(Number(e.target.value))}/></div>
            </div>
            <div className="edit-footer">
              <button className="btn-ghost" onClick={()=>setView("list")}>Volver</button>
              <button className="btn-primary inline" disabled={!firstName.trim()} onClick={handleSave}>Guardar jugador</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


// ─── Preset Courses Lima ──────────────────────────────────────────────────────
const PRESET_COURSES = [
  {
    id: "preset-losinkas",
    name: "Los Inkas Golf Club",
    city: "Surco, Lima",
    preset: true,
    updatedAt: "2026",
    holes: [
      {number:1,par:4,si:9},{number:2,par:4,si:13},{number:3,par:5,si:5},
      {number:4,par:3,si:15},{number:5,par:4,si:1},{number:6,par:3,si:17},
      {number:7,par:4,si:11},{number:8,par:5,si:3},{number:9,par:4,si:7},
      {number:10,par:4,si:8},{number:11,par:4,si:10},{number:12,par:4,si:14},
      {number:13,par:3,si:18},{number:14,par:5,si:12},{number:15,par:4,si:2},
      {number:16,par:5,si:4},{number:17,par:3,si:16},{number:18,par:4,si:6},
    ]
  },
  {
    id: "preset-limagolf",
    name: "Lima Golf Club",
    city: "San Isidro, Lima",
    preset: true,
    updatedAt: "2026",
    holes: [
      {number:1,par:5,si:11},{number:2,par:5,si:7},{number:3,par:4,si:9},
      {number:4,par:3,si:13},{number:5,par:4,si:3},{number:6,par:4,si:1},
      {number:7,par:3,si:17},{number:8,par:4,si:5},{number:9,par:4,si:15},
      {number:10,par:4,si:4},{number:11,par:3,si:12},{number:12,par:5,si:8},
      {number:13,par:3,si:18},{number:14,par:4,si:14},{number:15,par:4,si:2},
      {number:16,par:4,si:6},{number:17,par:5,si:16},{number:18,par:4,si:10},
    ]
  },
  {
    id: "preset-laplanicie",
    name: "Country Club La Planicie",
    city: "La Molina, Lima",
    preset: true,
    updatedAt: "2026",
    holes: [
      {number:1,par:4,si:15},{number:2,par:4,si:3},{number:3,par:3,si:17},
      {number:4,par:4,si:9},{number:5,par:5,si:11},{number:6,par:4,si:7},
      {number:7,par:4,si:1},{number:8,par:3,si:13},{number:9,par:4,si:5},
      {number:10,par:5,si:10},{number:11,par:4,si:2},{number:12,par:4,si:16},
      {number:13,par:3,si:12},{number:14,par:4,si:6},{number:15,par:4,si:18},
      {number:16,par:5,si:8},{number:17,par:3,si:14},{number:18,par:4,si:4},
    ]
  },
  {
    id: "preset-ccvilla",
    name: "Country Club de Villa",
    city: "Chorrillos, Lima",
    preset: true,
    updatedAt: "2026",
    holes: [
      {number:1,par:4,si:6},{number:2,par:4,si:12},{number:3,par:3,si:18},
      {number:4,par:5,si:2},{number:5,par:4,si:10},{number:6,par:3,si:16},
      {number:7,par:4,si:4},{number:8,par:4,si:14},{number:9,par:5,si:8},
      {number:10,par:4,si:13},{number:11,par:4,si:1},{number:12,par:5,si:7},
      {number:13,par:3,si:15},{number:14,par:4,si:5},{number:15,par:4,si:9},
      {number:16,par:3,si:17},{number:17,par:4,si:11},{number:18,par:5,si:3},
    ]
  },
];

// ─── Course Manager ───────────────────────────────────────────────────────────
function CourseManager({ courses, onSave, onLoad, onDelete, onClose, currentHoles, currentName, defaultCourseId, onSetDefault }) {
  const [view, setView] = useState("list");
  const [editing, setEditing] = useState(null);
  const [courseName, setCourseName] = useState("");
  const [courseCity, setCourseCity] = useState("");
  const [holes, setHoles] = useState(DEFAULT_HOLES);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const openEdit = (course) => { setEditing(course.id); setCourseName(course.name); setCourseCity(course.city||""); setHoles(course.holes); setView("edit"); };
  const openNew = () => { setEditing(null); setCourseName(""); setCourseCity(""); setHoles(DEFAULT_HOLES); setView("edit"); };
  const saveFromCurrent = () => { setEditing(null); setCourseName(currentName||""); setCourseCity(""); setHoles(currentHoles); setView("edit"); };
  const updateHole = (idx, field, value) => { const u=[...holes]; u[idx]={...u[idx],[field]:Number(value)}; setHoles(u); };
  const handleSave = () => {
    if (!courseName.trim()) return;
    onSave({ id: editing||("course-"+Date.now()), name:courseName.trim(), city:courseCity.trim(), holes, updatedAt:new Date().toLocaleDateString("es-ES") });
    setView("list");
  };

  return (
    <div className="modal-overlay" onClick={e => e.target===e.currentTarget&&onClose()}>
      <div className="modal-box">
        <div className="modal-header">
          <h2>{view==="list"?"📋 Campos guardados":(editing?"✏️ Editar campo":"➕ Nuevo campo")}</h2>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>
        {view==="list" && (
          <div className="modal-body">
            <div className="modal-actions-top">
              <button className="btn-ghost" onClick={saveFromCurrent}>💾 Guardar campo actual</button>
              <button className="btn-ghost" onClick={openNew}>+ Nuevo campo</button>
            </div>
            {courses.length===0 && <div className="empty-state"><div style={{fontSize:"2.5rem"}}>🏌️</div><p>No hay campos guardados aún.</p></div>}
            <div className="course-list">
              {courses.map(c => (
                <div key={c.id} className="course-card">
                  <div className="course-card-info">
                    <div className="course-card-name">{c.name}{c.id===defaultCourseId&&<span className="default-badge">⭐ Pred.</span>}</div>
                    <div className="course-card-sub">{c.city&&<span>{c.city} · </span>}Par {c.holes.reduce((a,h)=>a+h.par,0)} · {c.updatedAt}</div>
                  </div>
                  <div className="course-card-actions">
                    <button className="btn-mini green" onClick={()=>{onLoad(c);onClose();}}>Cargar</button>
                    <button className={"btn-mini"+(c.id===defaultCourseId?" active-sort":"")} onClick={()=>onSetDefault(c.id)} title="Campo predeterminado">{c.id===defaultCourseId?"⭐ Pred.":"☆ Pred."}</button>
                    <button className="btn-mini" onClick={()=>openEdit(c)}>Editar</button>
                    {confirmDelete===c.id
                      ? <><button className="btn-mini red" onClick={()=>{onDelete(c.id);setConfirmDelete(null);}}>¿Eliminar?</button><button className="btn-mini" onClick={()=>setConfirmDelete(null)}>No</button></>
                      : <button className="btn-mini red-ghost" onClick={()=>setConfirmDelete(c.id)}>✕</button>
                    }
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {view==="edit" && (
          <div className="modal-body">
            <div className="edit-fields">
              <div><label className="field-label">Nombre del campo *</label><input className="text-input" value={courseName} onChange={e=>setCourseName(e.target.value)} placeholder="Ej: Club de Golf Los Encinos"/></div>
              <div><label className="field-label">Ciudad / Ubicación</label><input className="text-input" value={courseCity} onChange={e=>setCourseCity(e.target.value)} placeholder="Ej: Ciudad de México"/></div>
            </div>
            <div style={{marginTop:16}}>
              <label className="field-label">Hoyos — Par total: {holes.reduce((a,h)=>a+h.par,0)}</label>
              <div className="holes-table-wrap">
                <table className="holes-table">
                  <thead><tr><th>Hoyo</th>{holes.map(h=><th key={h.number}>{h.number}</th>)}</tr></thead>
                  <tbody>
                    <tr><td className="row-label">Par</td>{holes.map((h,i)=><td key={h.number}><select className="cell-select" value={h.par} onChange={e=>updateHole(i,"par",e.target.value)}>{PAR_OPTIONS.map(p=><option key={p}>{p}</option>)}</select></td>)}</tr>
                    <tr><td className="row-label">SI</td>{holes.map((h,i)=><td key={h.number}><select className="cell-select" value={h.si} onChange={e=>updateHole(i,"si",e.target.value)}>{SI_OPTIONS.map(s=><option key={s}>{s}</option>)}</select></td>)}</tr>
                  </tbody>
                </table>
              </div>
            </div>
            <div className="edit-footer">
              <button className="btn-ghost" onClick={()=>setView("list")}>← Volver</button>
              <button className="btn-primary inline" disabled={!courseName.trim()} onClick={handleSave}>Guardar campo</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Setup Screen ─────────────────────────────────────────────────────────────
function SetupScreen({ onStart, courses, onSaveCourse, onDeleteCourse, history, onRestoreRound, onDeleteRound, savedPlayers, onSavePlayer, onDeletePlayer, defaultCourseId, onSetDefault }) {
  const today = new Date().toLocaleDateString("es-ES");
  const [holeCount, setHoleCount] = useState(18);
  const defaultCourse = defaultCourseId ? courses.find(c => c.id === defaultCourseId) : null;
  const [loadedCourse, setLoadedCourse] = useState(defaultCourse || null);
  const [holes, setHoles] = useState(defaultCourse ? defaultCourse.holes : DEFAULT_HOLES);
  const [roundName, setRoundName] = useState(defaultCourse ? defaultCourse.name + " " + today : "Ronda del " + today);
  const [groups, setGroups] = useState([{ id:"g1", name:"Grupo 1" }]);
  const [players, setPlayers] = useState([
    { id:1,name:"",handicap:18,groupId:"g1"},{id:2,name:"",handicap:18,groupId:"g1"},{id:3,name:"",handicap:18,groupId:"g1"},{id:4,name:"",handicap:18,groupId:"g1"},
  ]);
  const [showCourses, setShowCourses] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showPlayers, setShowPlayers] = useState(false);
  const [pickingGroupId, setPickingGroupId] = useState(null);
  const [pickingPlayerId, setPickingPlayerId] = useState(null);

  const [hdcPct, setHdcPct] = useState(100);
  const [showCustomHdc, setShowCustomHdc] = useState(false);
  const [customHdcVal, setCustomHdcVal] = useState("");


  const updatePlayer = (id,field,value) => setPlayers(players.map(p=>p.id===id?{...p,[field]:value}:p));
  const updateHole = (idx,field,value) => { const u=[...holes]; u[idx]={...u[idx],[field]:Number(value)}; setHoles(u); setLoadedCourse(null); };
  const loadCourse = course => { setHoles(course.holes); setLoadedCourse(course); setRoundName(course.name + " " + new Date().toLocaleDateString("es-ES")); };
  const canStart = players.every(p=>p.name.trim());
  const addGroup = () => {
    const id = "g" + Date.now();
    setGroups(g => [...g, { id, name: "Grupo " + (g.length + 1) }]);
    setPlayers(ps => [...ps, { id: Date.now(), name: "", handicap: 18, groupId: id }, { id: Date.now()+1, name: "", handicap: 18, groupId: id }]);
  };
  const removeGroup = (gid) => {
    if (groups.length <= 1) return;
    setGroups(g => g.filter(x => x.id !== gid));
    setPlayers(ps => ps.filter(p => p.groupId !== gid));
  };
  const updateGroupName = (gid, name) => setGroups(g => g.map(x => x.id === gid ? {...x, name} : x));
  const addPlayerToGroup = (gid) => { if(players.length>=12)return; setPlayers(ps=>[...ps,{id:Date.now(),name:"",handicap:18,groupId:gid}]); };
  const removePlayer = id => { const grp = players.find(p=>p.id===id)?.groupId; const inGrp = players.filter(p=>p.groupId===grp).length; if(inGrp<=1)return; setPlayers(players.filter(p=>p.id!==id)); };

  return (
    <div className="setup-screen">
      {showPlayers && <PlayerManager savedPlayers={savedPlayers} onSave={onSavePlayer} onDelete={onDeletePlayer} onClose={()=>{setShowPlayers(false);setPickingGroupId(null);setPickingPlayerId(null);}} onPick={(pl)=>{ if(pickingPlayerId) { setPlayers(ps=>ps.map(p=>p.id===pickingPlayerId?{...p,name:pl.firstName+" "+pl.lastName,handicap:pl.handicap}:p)); } else if(pickingGroupId){ if(players.length>=12)return; setPlayers(ps=>[...ps,{id:Date.now(),name:pl.firstName+" "+pl.lastName,handicap:pl.handicap,groupId:pickingGroupId}]); } setPickingPlayerId(null); }}/>}
      {showCourses && <CourseManager courses={courses} onSave={onSaveCourse} onLoad={loadCourse} onDelete={onDeleteCourse} onClose={()=>setShowCourses(false)} currentHoles={holes} currentName={loadedCourse?.name||""} defaultCourseId={defaultCourseId} onSetDefault={onSetDefault}/>}
      {showHistory && <HistoryModal history={history} onClose={()=>setShowHistory(false)} onRestore={onRestoreRound} onDeleteRound={onDeleteRound} />}

      <div className="setup-header">
        <div className="logo-mark">⛳</div>
        <h1>Golf Scorecard</h1>
        <p>Configura la ronda antes de comenzar</p>
      </div>

      <button className="history-btn" onClick={()=>setShowHistory(true)}>
        🕓 Historial {history.length > 0 && <span className="history-count">{history.length}</span>}
      </button>

      <div className="setup-section">
        <label className="field-label">Nombre de la ronda</label>
        <input className="text-input" value={roundName} onChange={e=>setRoundName(e.target.value)} placeholder="Ej: Copa del Club, Sábado con amigos..."/>
      </div>

      <div className="setup-section">
        <label className="field-label">Número de hoyos</label>
        <div className="hdc-pct-row">
          <button className={"hdc-pct-btn" + (holeCount===18?" active":"")} onClick={()=>setHoleCount(18)}>18 hoyos</button>
          <button className={"hdc-pct-btn" + (holeCount===9?" active":"")} onClick={()=>setHoleCount(9)}>9 hoyos (front)</button>
          <button className={"hdc-pct-btn" + (holeCount===9.1?" active":"")} onClick={()=>setHoleCount(9.1)}>9 hoyos (back)</button>
        </div>
      </div>

      <div className="setup-section">
        <label className="field-label">Porcentaje de handicap</label>
        <div className="hdc-pct-row">
          {[100, 85, 75].map(v => (
            <button key={v} className={"hdc-pct-btn" + (hdcPct === v && !showCustomHdc ? " active" : "")} onClick={() => { setHdcPct(v); setShowCustomHdc(false); }}>{v}%</button>
          ))}
          {!showCustomHdc && (
            <button className={"hdc-pct-btn" + (![100,85,75].includes(hdcPct) ? " active" : "")} onClick={() => { setShowCustomHdc(true); setCustomHdcVal(![100,85,75].includes(hdcPct) ? String(hdcPct) : ""); }}>
              {![100,85,75].includes(hdcPct) ? hdcPct + "%" : "Otro..."}
            </button>
          )}
          {showCustomHdc && (
            <div className="custom-hdc-row">
              <input
                type="number" min={1} max={100}
                className="number-input"
                style={{width:70}}
                value={customHdcVal}
                autoFocus
                onChange={e => setCustomHdcVal(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter") {
                    const v = Math.max(1, Math.min(100, Math.round(Number(customHdcVal))));
                    if (!isNaN(v) && customHdcVal !== "") { setHdcPct(v); setShowCustomHdc(false); }
                  }
                  if (e.key === "Escape") setShowCustomHdc(false);
                }}
                placeholder="%"
              />
              <button className="hdc-pct-btn active" onClick={() => {
                const v = Math.max(1, Math.min(100, Math.round(Number(customHdcVal))));
                if (!isNaN(v) && customHdcVal !== "") { setHdcPct(v); setShowCustomHdc(false); }
              }}>OK</button>
              <button className="hdc-pct-btn" onClick={() => setShowCustomHdc(false)}>✕</button>
            </div>
          )}
        </div>
      </div>

      <div className="setup-section">
        <div className="section-header">
          <label className="field-label">Grupos y jugadores ({players.length}/12)</label>
          <div style={{display:"flex",gap:6}}>
            <button className="btn-ghost" onClick={()=>{setShowPlayers(true);setPickingGroupId(null);}}>Jugadores</button>
            <button className="btn-ghost" onClick={addGroup} disabled={players.length>=10}>+ Grupo</button>
          </div>
        </div>
        {groups.map((g, gi) => {
          const gPlayers = players.filter(p => p.groupId === g.id);
          return (
            <div key={g.id} className="group-block">
              <div className="group-header">
                <input className="text-input group-name-input" value={g.name} onChange={e=>updateGroupName(g.id,e.target.value)} placeholder="Nombre del grupo"/>
                <button className="btn-ghost small" onClick={()=>addPlayerToGroup(g.id)} disabled={players.length>=12}>+ Vacío</button>
                <button className="btn-ghost small" onClick={()=>{setPickingGroupId(g.id);setShowPlayers(true);}}>+ Libreta</button>
                {groups.length > 1 && <button className="btn-remove" onClick={()=>removeGroup(g.id)} title="Eliminar grupo">✕</button>}
              </div>
              <div className="players-grid">
                {gPlayers.map((p,i) => (
                  <div key={p.id} className="player-row">
                    <span className="player-num">{gi+1}.{i+1}</span>
                    <input className="text-input flex-grow player-pick-input" placeholder={`Toca para buscar`} value={p.name} readOnly onFocus={()=>{setPickingGroupId(g.id);setPickingPlayerId(p.id);setShowPlayers(true);}} onClick={()=>{setPickingGroupId(g.id);setPickingPlayerId(p.id);setShowPlayers(true);}} />
                    <div className="hcp-field">
                      <label className="hcp-label">HCP</label>
                      <input type="number" className="number-input" min={0} max={54} value={p.handicap} onChange={e=>updatePlayer(p.id,"handicap",Number(e.target.value))}/>
                    </div>
                    {gPlayers.length > 1 && <button className="btn-remove" onClick={()=>removePlayer(p.id)}>✕</button>}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="setup-section">
        <div className="section-header">
          <label className="field-label">
            Campo
            {loadedCourse&&<span className="loaded-badge">📍 {loadedCourse.name}{loadedCourse.id===defaultCourseId&&" ⭐"}</span>}
            {!loadedCourse&&<span className="par-badge">Par {holes.reduce((a,h)=>a+h.par,0)}</span>}
          </label>
          <button className="btn-ghost" onClick={()=>setShowCourses(true)}>🏌️ Mis campos ({courses.length})</button>
        </div>
        <div className="holes-table-wrap">
          <table className="holes-table">
            <thead><tr><th>Hoyo</th>{holes.map(h=><th key={h.number}>{h.number}</th>)}</tr></thead>
            <tbody>
              <tr><td className="row-label">Par</td>{holes.map((h,i)=><td key={h.number}><select className="cell-select" value={h.par} onChange={e=>updateHole(i,"par",e.target.value)}>{PAR_OPTIONS.map(p=><option key={p}>{p}</option>)}</select></td>)}</tr>
              <tr><td className="row-label">SI</td>{holes.map((h,i)=><td key={h.number}><select className="cell-select" value={h.si} onChange={e=>updateHole(i,"si",e.target.value)}>{SI_OPTIONS.map(s=><option key={s}>{s}</option>)}</select></td>)}</tr>
            </tbody>
          </table>
        </div>
      </div>

      <button className="btn-primary" disabled={!canStart} onClick={()=>onStart({roundName,players,groups,holes:holeCount===9.1?holes.slice(9,18):holes.slice(0,Math.round(holeCount)),courseName:loadedCourse?.name||null,hdcPct})}>
        Comenzar ronda →
      </button>
      {!canStart&&<p className="hint">Ingresa el nombre de todos los jugadores para continuar.</p>}
    </div>
  );
}

// ─── Hole View (all players, one hole at a time) ──────────────────────────────
function HoleView({ session, onUpdate }) {
  const { players, holes } = session;
  const groups = session.groups || [{ id: "g1", name: "Grupo 1" }];
  const [holeIdx, setHoleIdx] = useState(0);
  const [activeGroupId, setActiveGroupId] = useState(groups[0].id);
  const hole = holes[holeIdx];

  const groupPlayers = players.filter(p => p.groupId === activeGroupId);

  const getScore = (pid) => session.scores?.[pid]?.[hole.number] ?? "";
  const setScore = (pid, value) => {
    const val = value === "" ? undefined : Math.max(1, Math.min(15, Number(value)));
    onUpdate({
      ...session,
      scores: {
        ...session.scores,
        [pid]: { ...(session.scores?.[pid] || {}), [hole.number]: val },
      },
    });
  };

  const allFilled = groupPlayers.every(p => !!getScore(p.id));
  const progress = holes.filter(h => players.every(p => !!(session.scores?.[p.id]?.[h.number]))).length;

  return (
    <div className="hole-view">
      <div className="hv-progress-wrap">
        <div className="hv-progress-bar" style={{ width: `${(progress / holes.length) * 100}%` }} />
      </div>
      <div className="hv-group-tabs">
        {groups.map(g => (
          <button key={g.id} className={"hv-group-tab" + (activeGroupId === g.id ? " active" : "")} onClick={() => setActiveGroupId(g.id)}>
            {g.name}
          </button>
        ))}
      </div>
      <div className="hv-hole-nav">
        <button className="hv-nav-btn" onClick={() => setHoleIdx(i => Math.max(0, i - 1))} disabled={holeIdx === 0}>{"<"}</button>
        <div className="hv-hole-info">
          <div className="hv-hole-num">Hoyo {hole.number}</div>
          <div className="hv-hole-meta">Par {hole.par} · SI {hole.si}</div>
        </div>
        <button className="hv-nav-btn" onClick={() => setHoleIdx(i => Math.min(holes.length - 1, i + 1))} disabled={holeIdx === holes.length - 1}>{">"}</button>
      </div>
      <div className="hv-dots">
        {holes.map((h, i) => {
          const groupPs = players.filter(p => p.groupId === activeGroupId);
          const done = groupPs.every(p => !!(session.scores?.[p.id]?.[h.number]));
          return (
            <button
              key={h.number}
              className={`hv-dot ${i === holeIdx ? "active" : ""} ${done ? "done" : ""}`}
              onClick={() => setHoleIdx(i)}
              title={`Hoyo ${h.number}`}
            />
          );
        })}
      </div>
      <div className="hv-players">
        {groupPlayers.map((p) => {
          const val = getScore(p.id);
          const diff = val !== "" ? val - hole.par : null;
          const cls = diff === null ? "" : diff < -1 ? "eagle" : diff === -1 ? "birdie" : diff === 0 ? "par" : diff === 1 ? "bogey" : "double";
          const ehcp = effectiveHcp(p.handicap, session.hdcPct ?? 100);
          const pts = val !== "" ? calcStableford(val, hole.par, hole.si, ehcp) : null;
          const total = totalStableford(session.scores?.[p.id] || {}, holes, ehcp);
          return (
            <div key={p.id} className={`hv-player-card ${cls}`}>
              <div className="hv-player-left">
                <div className="hv-player-name">{p.name}</div>
                <div className="hv-player-sub">HCP {p.handicap}{session.hdcPct && session.hdcPct !== 100 ? " (" + session.hdcPct + "% = " + effectiveHcp(p.handicap, session.hdcPct) + ")" : ""} · Total {total} pts</div>
              </div>
              <div className="hv-score-area">
                <button className="hv-stepper" onClick={() => setScore(p.id, val !== "" ? val - 1 : hole.par)}>−</button>
                <div className="hv-score-wrap">
                  <input
                    type="number"
                    className="hv-score-input"
                    min={1} max={15}
                    value={val}
                    onChange={e => setScore(p.id, e.target.value)}
                    placeholder={String(hole.par)}
                  />
                  {pts !== null && (
                    <div className={`hv-pts-badge ${pts >= 3 ? "eagle" : pts === 2 ? "par" : pts === 1 ? "bogey" : "double"}`}>
                      {pts} pt{pts !== 1 ? "s" : ""}
                    </div>
                  )}
                </div>
                <button className="hv-stepper" onClick={() => setScore(p.id, val !== "" ? Number(val) + 1 : hole.par)}>+</button>
              </div>
            </div>
          );
        })}
      </div>
      {holeIdx < holes.length - 1 && (
        <button
          className={`hv-next-btn ${allFilled ? "ready" : ""}`}
          onClick={() => setHoleIdx(i => i + 1)}
        >
          {allFilled ? `✓ Hoyo ${hole.number + 1} →` : `Siguiente hoyo →`}
        </button>
      )}
      {holeIdx === holes.length - 1 && (
        <div className="hv-finish-hint">
          {allFilled ? "✓ Todos los hoyos completados. Usa Finalizar para guardar." : "Completa los scores para terminar la ronda."}
        </div>
      )}
    </div>
  );
}


// ─── Match Play View ──────────────────────────────────────────────────────────
function MatchView({ session, onUpdate }) {
  const { players, holes } = session;
  const hdcPct = session.hdcPct ?? 100;
  const match = session.match || { modalidad: "matchplay", segments: [] };

  // Segments: 3 of 6 holes each (or 2 for 9-hole rounds)
  const segSize = 6;
  const numSegs = Math.ceil(holes.length / segSize);
  const segments = Array.from({ length: numSegs }, (_, i) => holes.slice(i * segSize, (i + 1) * segSize));

  const [editingSeg, setEditingSeg] = useState(null); // index of segment being configured
  const [draftA, setDraftA] = useState([]);
  const [draftB, setDraftB] = useState([]);
  const [draftModal, setDraftModal] = useState("matchplay");

  const getSegConfig = (i) => match.segments[i] || null;

  const saveSegConfig = (i, pairA, pairB, modalidad) => {
    const segs = [...(match.segments || [])];
    segs[i] = { pairA, pairB, modalidad };
    onUpdate({ ...session, match: { ...match, segments: segs } });
    setEditingSeg(null);
  };

  const openEdit = (i) => {
    const cfg = getSegConfig(i);
    setDraftA(cfg?.pairA || []);
    setDraftB(cfg?.pairB || []);
    setDraftModal(cfg?.modalidad || "matchplay");
    setEditingSeg(i);
  };

  const togglePlayer = (pid, side) => {
    if (side === "A") {
      if (draftA.includes(pid)) setDraftA(draftA.filter(x => x !== pid));
      else if (draftA.length < 2) setDraftA([...draftA, pid]);
    } else {
      if (draftB.includes(pid)) setDraftB(draftB.filter(x => x !== pid));
      else if (draftB.length < 2) setDraftB([...draftB, pid]);
    }
  };

  // Calculate match result for a segment
  const calcSegResult = (segHoles, cfg) => {
    if (!cfg || !cfg.pairA.length || !cfg.pairB.length) return null;
    const { pairA, pairB, modalidad } = cfg;
    let scoreA = 0, scoreB = 0;

    segHoles.forEach(hole => {
      const getNet = (pid) => {
        const s = (session.scores?.[pid] || {})[hole.number];
        if (!s) return null;
        const ehcp = effectiveHcp(players.find(p => p.id === pid)?.handicap || 0, hdcPct);
        return modalidad === "matchplay"
          ? s - Math.floor(ehcp / 18) - (hole.si <= (ehcp % 18) ? 1 : 0)
          : calcStableford(s, hole.par, hole.si, ehcp);
      };

      const netsA = pairA.map(getNet).filter(x => x !== null);
      const netsB = pairB.map(getNet).filter(x => x !== null);

      if (netsA.length < 2 || netsB.length < 2) return;

      // Sort: matchplay lower is better, mejorball higher is better
      const sortA = modalidad === "matchplay" ? [...netsA].sort((a,b)=>a-b) : [...netsA].sort((a,b)=>b-a);
      const sortB = modalidad === "matchplay" ? [...netsB].sort((a,b)=>a-b) : [...netsB].sort((a,b)=>b-a);

      // Best vs Best (index 0)
      const b1A = sortA[0], b1B = sortB[0];
      if (modalidad === "matchplay") {
        if (b1A < b1B) scoreA++;
        else if (b1B < b1A) scoreB++;
        // empate no suma
      } else {
        if (b1A > b1B) scoreA++;
        else if (b1B > b1A) scoreB++;
      }

      // Worst vs Worst (index 1)
      const b2A = sortA[1], b2B = sortB[1];
      if (modalidad === "matchplay") {
        if (b2A < b2B) scoreA++;
        else if (b2B < b2A) scoreB++;
      } else {
        if (b2A > b2B) scoreA++;
        else if (b2B > b2A) scoreB++;
      }
    });

    return { scoreA, scoreB, halved: 0 };
  };

  const pairName = (pids) => pids.map(pid => {
    const p = players.find(x => x.id === pid);
    return p ? p.name.split(" ")[0] : "?";
  }).join(" & ");

  return (
    <div className="match-view">
      <div className="match-header-info">
        <p>La ronda se divide en segmentos de {segSize} hoyos. Elige las parejas y modalidad para cada segmento.</p>
      </div>

      {segments.map((segHoles, i) => {
        const cfg = getSegConfig(i);
        const result = cfg ? calcSegResult(segHoles, cfg) : null;
        const holeRange = `Hoyos ${segHoles[0].number}–${segHoles[segHoles.length - 1].number}`;

        return (
          <div key={i} className="match-segment">
            <div className="match-seg-header">
              <div className="match-seg-title">
                <span className="match-seg-num">Segmento {i + 1}</span>
                <span className="match-seg-range">{holeRange}</span>
              </div>
              <button className="btn-mini" onClick={() => openEdit(i)}>
                {cfg ? "Editar" : "Configurar"}
              </button>
            </div>

            {!cfg && (
              <div className="match-no-config">Toca "Configurar" para elegir parejas y modalidad</div>
            )}

            {cfg && (
              <>
                <div className="match-pairs-row">
                  <div className="match-pair-card pair-a">
                    <div className="match-pair-label">Pareja A</div>
                    <div className="match-pair-names">{pairName(cfg.pairA)}</div>
                  </div>
                  <div className="match-vs">VS</div>
                  <div className="match-pair-card pair-b">
                    <div className="match-pair-label">Pareja B</div>
                    <div className="match-pair-names">{pairName(cfg.pairB)}</div>
                  </div>
                </div>
                <div className="match-modalidad">{cfg.modalidad === "matchplay" ? "Match Play clásico" : "Mejor Ball (Stableford)"}</div>

                {result && (
                  <div className="match-result">
                    <div className={`match-score-box ${result.scoreA > result.scoreB ? "winner" : ""}`}>
                      <div className="match-score-num">{result.scoreA}</div>
                      <div className="match-score-lbl">Pareja A</div>
                    </div>
                    <div className="match-halved-box">
                      {result.scoreA === result.scoreB && <span className="match-tie">Empate</span>}
                      {result.scoreA !== result.scoreB && (
                        <span className="match-winner-lbl">
                          Gana {result.scoreA > result.scoreB ? "A" : "B"}
                        </span>
                      )}
                      <div style={{fontSize:"0.65rem",color:"var(--muted)",marginTop:4}}>max {segHoles.length*2} pts</div>
                    </div>
                    <div className={`match-score-box ${result.scoreB > result.scoreA ? "winner" : ""}`}>
                      <div className="match-score-num">{result.scoreB}</div>
                      <div className="match-score-lbl">Pareja B</div>
                    </div>
                  </div>
                )}

                <div className="match-hole-detail">
                  {segHoles.map(hole => {
                    const scA = cfg.pairA.map(pid => (session.scores?.[pid] || {})[hole.number]).filter(Boolean);
                    const scB = cfg.pairB.map(pid => (session.scores?.[pid] || {})[hole.number]).filter(Boolean);
                    const hasScore = scA.length && scB.length;
                    let winner = null;
                    if (hasScore) {
                      const netA = cfg.pairA.map(pid => {
                        const s = (session.scores?.[pid]||{})[hole.number]; if(!s) return null;
                        const ehcp = effectiveHcp(players.find(p=>p.id===pid)?.handicap||0, hdcPct);
                        return cfg.modalidad==="matchplay" ? s - Math.floor(ehcp/18)-(hole.si<=(ehcp%18)?1:0) : calcStableford(s,hole.par,hole.si,ehcp);
                      }).filter(x=>x!==null);
                      const netB = cfg.pairB.map(pid => {
                        const s = (session.scores?.[pid]||{})[hole.number]; if(!s) return null;
                        const ehcp = effectiveHcp(players.find(p=>p.id===pid)?.handicap||0, hdcPct);
                        return cfg.modalidad==="matchplay" ? s - Math.floor(ehcp/18)-(hole.si<=(ehcp%18)?1:0) : calcStableford(s,hole.par,hole.si,ehcp);
                      }).filter(x=>x!==null);
                      if (netA.length >= 2 && netB.length >= 2) {
                        const sA = cfg.modalidad==="matchplay"?[...netA].sort((a,b)=>a-b):[...netA].sort((a,b)=>b-a);
                        const sB = cfg.modalidad==="matchplay"?[...netB].sort((a,b)=>a-b):[...netB].sort((a,b)=>b-a);
                        let ptA=0,ptB=0;
                        // best vs best
                        if(cfg.modalidad==="matchplay"){if(sA[0]<sB[0])ptA++;else if(sB[0]<sA[0])ptB++;}
                        else{if(sA[0]>sB[0])ptA++;else if(sB[0]>sA[0])ptB++;}
                        // worst vs worst
                        if(cfg.modalidad==="matchplay"){if(sA[1]<sB[1])ptA++;else if(sB[1]<sA[1])ptB++;}
                        else{if(sA[1]>sB[1])ptA++;else if(sB[1]>sA[1])ptB++;}
                        winner = ptA>0&&ptB===0?"A":ptB>0&&ptA===0?"B":ptA>0&&ptB>0?"E":"";
                      }
                    }
                    return (
                      <div key={hole.number} className={`match-hole-row ${winner==="A"?"won-a":winner==="B"?"won-b":winner==="E"?"halved":""}`}>
                        <span className="match-hole-scores">{scA.join("/")||"—"}</span>
                        <span className="match-hole-num">H{hole.number} P{hole.par}</span>
                        <span className="match-hole-scores">{scB.join("/")||"—"}</span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        );
      })}

      {/* Pair Editor Modal */}
      {editingSeg !== null && (
        <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setEditingSeg(null)}>
          <div className="modal-box">
            <div className="modal-header">
              <h2>Segmento {editingSeg+1} · Hoyos {segments[editingSeg][0].number}–{segments[editingSeg][segments[editingSeg].length-1].number}</h2>
              <button className="btn-icon" onClick={()=>setEditingSeg(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="field-label" style={{marginBottom:6}}>Modalidad</div>
              <div className="hdc-pct-row" style={{marginBottom:16}}>
                <button className={"hdc-pct-btn"+(draftModal==="matchplay"?" active":"")} onClick={()=>setDraftModal("matchplay")}>Match Play</button>
                <button className={"hdc-pct-btn"+(draftModal==="mejorball"?" active":"")} onClick={()=>setDraftModal("mejorball")}>Mejor Ball</button>
              </div>
              <div className="field-label" style={{marginBottom:6}}>Elige parejas (toca un jugador para asignarlo)</div>
              <div className="match-pair-editor">
                <div className="match-pair-col">
                  <div className="match-pair-col-label pair-a-label">Pareja A</div>
                  {draftA.map(pid => {
                    const p = players.find(x=>x.id===pid);
                    return <div key={pid} className="match-player-chip chip-a" onClick={()=>togglePlayer(pid,"A")}>{p?.name.split(" ")[0]} ✕</div>;
                  })}
                  {draftA.length < 2 && <div className="match-player-chip chip-empty">+ jugador</div>}
                </div>
                <div className="match-pair-col">
                  <div className="match-pair-col-label pair-b-label">Pareja B</div>
                  {draftB.map(pid => {
                    const p = players.find(x=>x.id===pid);
                    return <div key={pid} className="match-player-chip chip-b" onClick={()=>togglePlayer(pid,"B")}>{p?.name.split(" ")[0]} ✕</div>;
                  })}
                  {draftB.length < 2 && <div className="match-player-chip chip-empty">+ jugador</div>}
                </div>
              </div>
              <div className="match-player-list">
                {players.map(p => {
                  const inA = draftA.includes(p.id);
                  const inB = draftB.includes(p.id);
                  return (
                    <div key={p.id} className={`match-player-option ${inA?"in-a":inB?"in-b":""}`}>
                      <span>{p.name}</span>
                      <div style={{display:"flex",gap:6}}>
                        <button className={"btn-mini"+(inA?" active-sort":"")} onClick={()=>togglePlayer(p.id,"A")} disabled={!inA&&draftA.length>=2}>{inA?"✓ A":"+ A"}</button>
                        <button className={"btn-mini"+(inB?" active-sort":"")} onClick={()=>togglePlayer(p.id,"B")} disabled={!inB&&draftB.length>=2}>{inB?"✓ B":"+ B"}</button>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="edit-footer">
                <button className="btn-ghost" onClick={()=>setEditingSeg(null)}>Cancelar</button>
                <button className="btn-primary inline" disabled={draftA.length===0||draftB.length===0} onClick={()=>saveSegConfig(editingSeg,draftA,draftB,draftModal)}>
                  Guardar parejas
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Scorecard Screen ─────────────────────────────────────────────────────────
function ScorecardScreen({ session, onUpdate, onFinish, history, onRestoreRound, onDeleteRound }) {
  const { roundName, players, holes } = session;
  const [activePlayer, setActivePlayer] = useState(players[0].id);
  const [activeTab, setActiveTab] = useState("hoyo");
  const [confirmNew, setConfirmNew] = useState(false);
  const [confirmFinish, setConfirmFinish] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const player = players.find(p=>p.id===activePlayer);
  const scores = session.scores?.[activePlayer]||{};
  const hdcPct = session.hdcPct ?? 100;
  const playerEhcp = effectiveHcp(player?.handicap || 0, hdcPct);

  const updateScore = (holeNumber, value) => {
    const val = value===""?undefined:Math.max(1,Math.min(15,Number(value)));
    onUpdate({ ...session, scores:{ ...session.scores, [activePlayer]:{ ...(session.scores?.[activePlayer]||{}), [holeNumber]:val } } });
  };

  const front9=holes.slice(0,9), back9=holes.slice(9,18);
  const holeTotal=(hs,pid)=>hs.reduce((a,h)=>a+((session.scores?.[pid]||{})[h.number]||0),0);
  const stablefordTotal=(hs,pid)=>{
    const hcp=effectiveHcp(players.find(p=>p.id===pid)?.handicap||0, hdcPct);
    const sc=session.scores?.[pid]||{};
    return hs.reduce((a,h)=>a+(sc[h.number]?(calcStableford(sc[h.number],h.par,h.si,hcp)??0):0),0);
  };
  const leaderboard=players.map(p=>({...p,total:totalStableford(session.scores?.[p.id]||{},holes,effectiveHcp(p.handicap,hdcPct)),strokes:holeTotal(holes,p.id)})).sort((a,b)=>b.total-a.total);
  const parTotal = holes.reduce((a,h)=>a+h.par,0);
  const grossBoard=players.map(p=>{
    const sc=session.scores?.[p.id]||{};
    const playedHoles=holes.filter(h=>!!sc[h.number]);
    const strokes=playedHoles.reduce((a,h)=>a+sc[h.number],0);
    const playedPar=playedHoles.reduce((a,h)=>a+h.par,0);
    const diff=playedHoles.length>0?strokes-playedPar:null;
    return {...p,strokes,diff,played:playedHoles.length};
  }).filter(p=>p.played>0).sort((a,b)=>a.strokes-b.strokes);
  const medalBoard=players.map(p=>{
    const sc=session.scores?.[p.id]||{};
    const playedHoles=holes.filter(h=>!!sc[h.number]);
    const strokes=playedHoles.reduce((a,h)=>a+sc[h.number],0);
    const playedPar=playedHoles.reduce((a,h)=>a+h.par,0);
    const ehcp=effectiveHcp(p.handicap,hdcPct);
    const hcpForPlayed=Math.round(ehcp*(playedHoles.length/holes.length));
    const net=playedHoles.length>0?strokes-hcpForPlayed:null;
    const diff=net!==null?net-playedPar:null;
    return {...p,strokes,net,diff,played:playedHoles.length};
  }).filter(p=>p.played>0).sort((a,b)=>a.net-b.net);

  const renderHalf=(hs,label)=>(
    <div className="half-table-wrap">
      <div className="half-label">{label}</div>
      <table className="score-table">
        <thead>
          <tr><th>Hoyo</th>{hs.map(h=><th key={h.number}>{h.number}</th>)}<th>Tot</th></tr>
          <tr className="par-row"><th>Par</th>{hs.map(h=><th key={h.number}>{h.par}</th>)}<th>{hs.reduce((a,h)=>a+h.par,0)}</th></tr>
          <tr className="si-row"><th>SI</th>{hs.map(h=><th key={h.number}>{h.si}</th>)}<th>—</th></tr>
        </thead>
        <tbody>
          <tr className="score-row">
            <td className="row-label">Golpes</td>
            {hs.map(h=>{
              const val=scores[h.number]||"";
              const diff=val?val-h.par:null;
              const cls=diff===null?"":diff<-1?"eagle":diff===-1?"birdie":diff===0?"par":diff===1?"bogey":"double";
              return <td key={h.number} className={`score-cell ${cls}`}><input type="number" min={1} max={15} value={val} onChange={e=>updateScore(h.number,e.target.value)} className="score-input" placeholder="—"/></td>;
            })}
            <td className="total-cell">{holeTotal(hs,activePlayer)||"—"}</td>
          </tr>
          <tr className="stableford-row">
            <td className="row-label">Stbl</td>
            {hs.map(h=>{
              const s=scores[h.number];
              const pts=s?calcStableford(s,h.par,h.si,playerEhcp):null;
              return <td key={h.number} className={`pts-cell ${pts!==null?(pts>=3?"eagle":pts===2?"par":pts===1?"bogey":"double"):""}`}>{pts!==null?pts:"—"}</td>;
            })}
            <td className="total-cell stf-total">{stablefordTotal(hs,activePlayer)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="scorecard-screen">
      {showHistory && <HistoryModal history={history||[]} onClose={()=>setShowHistory(false)} onRestore={(sess)=>{onRestoreRound(sess);}} onDeleteRound={onDeleteRound}/>}
      {confirmNew && <ConfirmDialog message="¿Comenzar una nueva ronda? La ronda actual se guardará en el historial." onConfirm={()=>{setConfirmNew(false);onFinish(session,true);}} onCancel={()=>setConfirmNew(false)}/>}
      {confirmFinish && <ConfirmDialog message="¿Marcar esta ronda como finalizada y guardarla en el historial?" onConfirm={()=>{setConfirmFinish(false);onFinish(session,false);}} onCancel={()=>setConfirmFinish(false)}/>}

      <header className="top-bar">
        <div className="round-name">{roundName}{session.courseName&&<span className="course-badge"> · {session.courseName}</span>}</div>
        <div className="tab-bar">
          <button className={`tab ${activeTab==="hoyo"?"active":""}`} onClick={()=>setActiveTab("hoyo")}>Por hoyo</button>
          <button className={`tab ${activeTab==="scorecard"?"active":""}`} onClick={()=>setActiveTab("scorecard")}>Tarjeta</button>
          <button className={`tab ${activeTab==="leaderboard"?"active":""}`} onClick={()=>setActiveTab("leaderboard")}>Stableford</button>
          <button className={`tab ${activeTab==="medal-neto"?"active":""}`} onClick={()=>setActiveTab("medal-neto")}>Medal Neto</button>
          <button className={`tab ${activeTab==="medal-gross"?"active":""}`} onClick={()=>setActiveTab("medal-gross")}>Medal Gross</button>
          <button className={`tab ${activeTab==="match"?"active":""}`} onClick={()=>setActiveTab("match")}>Parejas</button>
          <button className={`tab ${activeTab==="vegas"?"active":""}`} onClick={()=>setActiveTab("vegas")}>Vegas</button>
        </div>
        <div style={{display:"flex",gap:6}}>
          <button className="btn-ghost small" onClick={()=>setShowHistory(true)}>🕓</button>
          <button className="btn-ghost small" onClick={()=>setConfirmFinish(true)}>✓ Finalizar</button>
          <button className="btn-ghost small" onClick={()=>setConfirmNew(true)}>Nueva</button>
        </div>
      </header>

      {activeTab==="hoyo"&&(
        <HoleView session={session} onUpdate={onUpdate} />
      )}

      {activeTab==="match"&&(
        <MatchView session={session} onUpdate={onUpdate} />
      )}

      {activeTab==="vegas"&&(
        <VegasView session={session} onUpdate={onUpdate} />
      )}

      {activeTab==="scorecard"&&(
        <>
          <div className="player-tabs">
            {players.map(p=>{
              const pts=totalStableford(session.scores?.[p.id]||{},holes,p.handicap);
              return <button key={p.id} className={`player-tab ${activePlayer===p.id?"active":""}`} onClick={()=>setActivePlayer(p.id)}><span className="ptab-name">{p.name}</span><span className="ptab-pts">{pts} pts</span></button>;
            })}
          </div>
          <div className="player-info-bar">
            <span className="pname">{player.name}</span>
            <span className="phcp">HCP {player.handicap}{hdcPct !== 100 ? " (" + hdcPct + "% = " + playerEhcp + ")" : ""}</span>
            <span className="ptotal">Total: <strong>{totalStableford(scores,holes,playerEhcp)} pts Stableford</strong></span>
          </div>
          <div className="legend">
            <span className="leg eagle">Eagle+</span><span className="leg birdie">Birdie</span><span className="leg par">Par</span><span className="leg bogey">Bogey</span><span className="leg double">+2 o más</span>
          </div>
          <div className="tables-wrap">
            {renderHalf(front9,"Hoyos 1–9")}
            {renderHalf(back9,"Hoyos 10–18")}
          </div>
          <div className="grand-total">
            <div className="gt-item"><span>Golpes totales</span><strong>{holeTotal(holes,activePlayer)||"—"}</strong></div>
            <div className="gt-item highlight"><span>Stableford total</span><strong>{totalStableford(scores,holes,player.handicap)} pts</strong></div>
          </div>
        </>
      )}
      {activeTab==="leaderboard"&&(
        <div className="leaderboard">
          <h2 className="lb-title">Clasificación Stableford</h2>
          {leaderboard.map((p,i)=>(
            <div key={p.id} className={`lb-row ${i===0?"leader":""}`}>
              <div className="lb-rank">{i===0?"🏆":i+1}</div>
              <div className="lb-info"><div className="lb-name">{p.name}</div><div className="lb-sub">HCP {p.handicap} · {p.strokes||0} golpes</div></div>
              <div className="lb-pts">{p.total} <span>pts</span></div>
            </div>
          ))}
        </div>
      )}
      {activeTab==="medal-neto"&&(
        <div className="leaderboard">
          <h2 className="lb-title">Medal Neto</h2>
          {medalBoard.length===0 && <div className="empty-state"><p>Aún no hay scores registrados.</p></div>}
          {medalBoard.map((p,i)=>{
            const diffStr = p.diff===null?"—":p.diff===0?"E":p.diff>0?"+"+p.diff:String(p.diff);
            return (
              <div key={p.id} className={`lb-row ${i===0?"leader":""}`}>
                <div className="lb-rank">{i===0?"🏆":i+1}</div>
                <div className="lb-info">
                  <div className="lb-name">{p.name}</div>
                  <div className="lb-sub">HCP {effectiveHcp(p.handicap,hdcPct)} · {p.played} hoyos · {p.strokes} brutos</div>
                </div>
                <div className="lb-medal-score">
                  <div className="lb-net">{p.net} <span>neto</span></div>
                  <div className={"lb-diff "+(p.diff<0?"under":p.diff===0?"even":"over")}>{diffStr}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {activeTab==="medal-gross"&&(
        <div className="leaderboard">
          <h2 className="lb-title">Medal Gross</h2>
          {grossBoard.length===0 && <div className="empty-state"><p>Aún no hay scores registrados.</p></div>}
          {grossBoard.map((p,i)=>{
            const diffStr = p.diff===null?"—":p.diff===0?"E":p.diff>0?"+"+p.diff:String(p.diff);
            return (
              <div key={p.id} className={`lb-row ${i===0?"leader":""}`}>
                <div className="lb-rank">{i===0?"🏆":i+1}</div>
                <div className="lb-info">
                  <div className="lb-name">{p.name}</div>
                  <div className="lb-sub">HCP {p.handicap} · {p.played} hoyos · Par {holes.filter(h=>!!(session.scores?.[p.id]||{})[h.number]).reduce((a,h)=>a+h.par,0)}</div>
                </div>
                <div className="lb-medal-score">
                  <div className="lb-net">{p.strokes} <span>bruto</span></div>
                  <div className={"lb-diff "+(p.diff<0?"under":p.diff===0?"even":"over")}>{diffStr}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}


// ─── Vegas View ───────────────────────────────────────────────────────────────
function VegasView({ session, onUpdate }) {
  const { players, holes } = session;
  const vegas = session.vegas || { valorPunto: 1, segments: [] };
  const segSize = 6;
  const numSegs = Math.ceil(holes.length / segSize);
  const segments = Array.from({ length: numSegs }, (_, i) => holes.slice(i * segSize, (i + 1) * segSize));

  const [editingSeg, setEditingSeg] = useState(null);
  const [draftA, setDraftA] = useState([]);
  const [draftB, setDraftB] = useState([]);
  const [editingValor, setEditingValor] = useState(false);
  const [draftValor, setDraftValor] = useState(vegas.valorPunto);

  const getSegCfg = (i) => vegas.segments[i] || null;

  const saveSegCfg = (i, pairA, pairB) => {
    const segs = [...(vegas.segments || [])];
    segs[i] = { pairA, pairB };
    onUpdate({ ...session, vegas: { ...vegas, segments: segs } });
    setEditingSeg(null);
  };

  const saveValor = () => {
    onUpdate({ ...session, vegas: { ...vegas, valorPunto: Number(draftValor) } });
    setEditingValor(false);
  };

  const togglePlayer = (pid, side) => {
    if (side === "A") {
      if (draftA.includes(pid)) setDraftA(draftA.filter(x => x !== pid));
      else if (draftA.length < 2) setDraftA([...draftA, pid]);
    } else {
      if (draftB.includes(pid)) setDraftB(draftB.filter(x => x !== pid));
      else if (draftB.length < 2) setDraftB([...draftB, pid]);
    }
  };

  const vegasNum = (scores) => {
    const sorted = [...scores].sort((a, b) => a - b);
    return sorted.length === 2 ? parseInt(String(sorted[0]) + String(sorted[1])) : null;
  };

  const calcSeg = (segHoles, cfg) => {
    if (!cfg || !cfg.pairA.length || !cfg.pairB.length) return null;
    let totalDiff = 0;
    let holesPlayed = 0;
    const holeDetail = segHoles.map(hole => {
      const scA = cfg.pairA.map(pid => (session.scores?.[pid] || {})[hole.number]).filter(Boolean);
      const scB = cfg.pairB.map(pid => (session.scores?.[pid] || {})[hole.number]).filter(Boolean);
      if (scA.length < 2 || scB.length < 2) return { hole, numA: null, numB: null, diff: null };
      const numA = vegasNum(scA);
      const numB = vegasNum(scB);
      const diff = numA < numB ? numB - numA : numA > numB ? -(numA - numB) : 0;
      totalDiff += diff;
      holesPlayed++;
      return { hole, numA, numB, diff };
    });
    return { totalDiff, holesPlayed, holeDetail };
  };

  const pairName = (pids) => pids.map(pid => {
    const p = players.find(x => x.id === pid);
    return p ? p.name.split(" ")[0] : "?";
  }).join(" & ");

  // Grand total across segments
  const grandTotal = vegas.segments.reduce((acc, cfg, i) => {
    if (!cfg) return acc;
    const result = calcSeg(segments[i], cfg);
    return result ? acc + result.totalDiff : acc;
  }, 0);

  return (
    <div className="match-view">
      <div className="vegas-header-card">
        <div className="vegas-header-left">
          <div className="vegas-title">🎰 Vegas</div>
          <div className="vegas-subtitle">Segmentos de {segSize} hoyos · Parejas rotativas</div>
        </div>
        <div className="vegas-valor-wrap">
          {!editingValor ? (
            <div className="vegas-valor-display" onClick={() => { setDraftValor(vegas.valorPunto); setEditingValor(true); }}>
              <div className="vegas-valor-num">S/ {vegas.valorPunto}</div>
              <div className="vegas-valor-lbl">por punto</div>
            </div>
          ) : (
            <div className="vegas-valor-edit">
              <input type="number" className="number-input" min={1} value={draftValor} onChange={e => setDraftValor(e.target.value)} style={{width:60}} autoFocus/>
              <button className="btn-mini green" onClick={saveValor}>OK</button>
            </div>
          )}
        </div>
      </div>

      {segments.map((segHoles, i) => {
        const cfg = getSegCfg(i);
        const result = cfg ? calcSeg(segHoles, cfg) : null;
        const holeRange = `Hoyos ${segHoles[0].number}–${segHoles[segHoles.length-1].number}`;
        const winnerA = result && result.totalDiff > 0;
        const winnerB = result && result.totalDiff < 0;
        const soles = result ? Math.abs(result.totalDiff) * vegas.valorPunto : 0;

        return (
          <div key={i} className="match-segment">
            <div className="match-seg-header">
              <div className="match-seg-title">
                <span className="match-seg-num">Segmento {i+1}</span>
                <span className="match-seg-range">{holeRange}</span>
              </div>
              <button className="btn-mini" onClick={() => { const c=getSegCfg(i); setDraftA(c?.pairA||[]); setDraftB(c?.pairB||[]); setEditingSeg(i); }}>
                {cfg ? "Editar" : "Configurar"}
              </button>
            </div>

            {!cfg && <div className="match-no-config">Toca "Configurar" para elegir parejas</div>}

            {cfg && (
              <>
                <div className="match-pairs-row">
                  <div className={`match-pair-card pair-a ${winnerA?"vegas-winner":""}`}>
                    <div className="match-pair-label">Pareja A</div>
                    <div className="match-pair-names">{pairName(cfg.pairA)}</div>
                  </div>
                  <div className="match-vs">VS</div>
                  <div className={`match-pair-card pair-b ${winnerB?"vegas-winner":""}`}>
                    <div className="match-pair-label">Pareja B</div>
                    <div className="match-pair-names">{pairName(cfg.pairB)}</div>
                  </div>
                </div>

                {result && result.holesPlayed > 0 && (
                  <div className="vegas-result">
                    <div className="vegas-result-row">
                      <span className="vegas-result-label">Diferencia acumulada:</span>
                      <span className="vegas-result-val">{result.totalDiff > 0 ? "+" : ""}{result.totalDiff}</span>
                    </div>
                    <div className="vegas-result-row">
                      <span className="vegas-result-label">Pago ({result.holesPlayed}/{segSize} hoyos):</span>
                      <span className={`vegas-soles ${soles > 0 ? "positive" : ""}`}>S/ {soles}</span>
                    </div>
                    {soles > 0 && (
                      <div className="vegas-paga">
                        Paga {winnerA ? pairName(cfg.pairB) : pairName(cfg.pairA)} → {winnerA ? pairName(cfg.pairA) : pairName(cfg.pairB)}
                      </div>
                    )}
                    {result.totalDiff === 0 && result.holesPlayed === segSize && (
                      <div className="vegas-paga">Empate — nadie paga</div>
                    )}
                  </div>
                )}

                <div className="match-hole-detail">
                  <div className="vegas-hole-header">
                    <span>{pairName(cfg.pairA)}</span>
                    <span>Hoyo</span>
                    <span>{pairName(cfg.pairB)}</span>
                  </div>
                  {result && result.holeDetail.map(({ hole, numA, numB, diff }) => (
                    <div key={hole.number} className={`match-hole-row ${diff===null?"":diff>0?"won-a":diff<0?"won-b":"halved"}`}>
                      <span className="match-hole-scores">{numA ?? "—"}</span>
                      <span className="match-hole-num">H{hole.number} P{hole.par}</span>
                      <span className="match-hole-scores">{numB ?? "—"}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        );
      })}

      {grandTotal !== 0 && (
        <div className="vegas-grand-total">
          <div className="vegas-gt-label">Total del día</div>
          <div className="vegas-gt-amount">S/ {Math.abs(grandTotal) * vegas.valorPunto}</div>
          <div className="vegas-gt-sub">
            {grandTotal > 0 ? "Pareja A gana" : "Pareja B gana"} · diferencia {Math.abs(grandTotal)} pts
          </div>
        </div>
      )}

      {editingSeg !== null && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setEditingSeg(null)}>
          <div className="modal-box">
            <div className="modal-header">
              <h2>Segmento {editingSeg+1} · {segments[editingSeg][0].number}–{segments[editingSeg][segments[editingSeg].length-1].number}</h2>
              <button className="btn-icon" onClick={() => setEditingSeg(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="field-label" style={{marginBottom:8}}>Elige parejas</div>
              <div className="match-pair-editor">
                <div className="match-pair-col">
                  <div className="match-pair-col-label pair-a-label">Pareja A</div>
                  {draftA.map(pid => { const p=players.find(x=>x.id===pid); return <div key={pid} className="match-player-chip chip-a" onClick={()=>togglePlayer(pid,"A")}>{p?.name.split(" ")[0]} ✕</div>; })}
                  {draftA.length < 2 && <div className="match-player-chip chip-empty">+ jugador</div>}
                </div>
                <div className="match-pair-col">
                  <div className="match-pair-col-label pair-b-label">Pareja B</div>
                  {draftB.map(pid => { const p=players.find(x=>x.id===pid); return <div key={pid} className="match-player-chip chip-b" onClick={()=>togglePlayer(pid,"B")}>{p?.name.split(" ")[0]} ✕</div>; })}
                  {draftB.length < 2 && <div className="match-player-chip chip-empty">+ jugador</div>}
                </div>
              </div>
              <div className="match-player-list">
                {players.map(p => {
                  const inA = draftA.includes(p.id), inB = draftB.includes(p.id);
                  return (
                    <div key={p.id} className={`match-player-option ${inA?"in-a":inB?"in-b":""}`}>
                      <span>{p.name}</span>
                      <div style={{display:"flex",gap:6}}>
                        <button className={"btn-mini"+(inA?" active-sort":"")} onClick={()=>togglePlayer(p.id,"A")} disabled={!inA&&draftA.length>=2}>{inA?"✓ A":"+ A"}</button>
                        <button className={"btn-mini"+(inB?" active-sort":"")} onClick={()=>togglePlayer(p.id,"B")} disabled={!inB&&draftB.length>=2}>{inB?"✓ B":"+ B"}</button>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="edit-footer">
                <button className="btn-ghost" onClick={() => setEditingSeg(null)}>Cancelar</button>
                <button className="btn-primary inline" disabled={draftA.length===0||draftB.length===0} onClick={() => saveSegCfg(editingSeg, draftA, draftB)}>Guardar parejas</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function GolfApp() {
  const [session, setSession] = useState(null);
  const [courses, setCourses] = useState([]);
  const [savedPlayers, setSavedPlayers] = useState([]);
  const [defaultCourseId, setDefaultCourseId] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastSaved, setLastSaved] = useState(null);

  useEffect(() => {
    async function load() {
      try {
        const [sRes, cRes, hRes, pRes] = await Promise.all([
          fbGet(STORAGE_KEY),
          fbGet(COURSES_KEY),
          fbGet(HISTORY_KEY),
          fbGet(PLAYERS_KEY),
        ]);
        if (sRes?.value) setSession(JSON.parse(sRes.value));
        if (cRes?.value) setCourses(JSON.parse(cRes.value));
        if (hRes?.value) setHistory(JSON.parse(hRes.value));
        if (pRes?.value) setSavedPlayers(JSON.parse(pRes.value));
        const dcRes = await fbGet(DEFAULT_COURSE_KEY).catch(()=>null);
        if (dcRes?.value) setDefaultCourseId(dcRes.value);
      } catch(e){}
      setLoading(false);
    }
    load();
  }, []);

  // Poll every 5s
  useEffect(() => {
    if (!session) return;
    const interval = setInterval(async () => {
      try {
        const r = await fbGet(STORAGE_KEY);
        if (r?.value) { const remote=JSON.parse(r.value); if(remote.updatedAt!==session.updatedAt) setSession(remote); }
      } catch(e){}
    }, 5000);
    return () => clearInterval(interval);
  }, [session]);

  const saveHistory = useCallback(async (sess, newHistArr) => {
    try { await fbSet(HISTORY_KEY, JSON.stringify(newHistArr)); } catch(e){}
    setHistory(newHistArr);
  }, []);

  const startSession = async (data) => {
    const s = { ...data, scores:{}, updatedAt:Date.now() };
    setSession(s);
    try { await fbSet(STORAGE_KEY, JSON.stringify(s)); } catch(e){}
  };

  const updateSession = useCallback(async (updated) => {
    const s = { ...updated, updatedAt:Date.now() };
    setSession(s);
    setLastSaved(new Date());
    try { await fbSet(STORAGE_KEY, JSON.stringify(s)); } catch(e){}
  }, []);

  // Finish: archive to history, optionally clear session for new round
  const finishSession = useCallback(async (sess, startNew) => {
    const entry = { id:"round-"+Date.now(), savedAt:new Date().toLocaleDateString("es-ES",{day:"2-digit",month:"short",year:"numeric"}), session:sess };
    const newHist = [entry, ...history].slice(0,50); // keep last 50
    await saveHistory(sess, newHist);
    if (startNew) {
      setSession(null);
      try { await fbDelete(STORAGE_KEY); } catch(e){}
    } else {
      // just archive, keep viewing
      setSession(null);
      try { await fbDelete(STORAGE_KEY); } catch(e){}
    }
  }, [history, saveHistory]);

  const restoreRound = async (sess) => {
    const s = { ...sess, updatedAt:Date.now() };
    setSession(s);
    try { await fbSet(STORAGE_KEY, JSON.stringify(s)); } catch(e){}
  };

  const deleteRound = async (id) => {
    const updated = history.filter(r=>r.id!==id);
    await saveHistory(null, updated);
  };
  const setDefaultCourse = async (id) => {
    setDefaultCourseId(id);
    try { await fbSet(DEFAULT_COURSE_KEY, id); } catch(e) {}
  };
  const savePlayer = async (player) => {
    const updated = savedPlayers.some(p=>p.id===player.id) ? savedPlayers.map(p=>p.id===player.id?player:p) : [...savedPlayers,player];
    setSavedPlayers(updated);
    try { await fbSet(PLAYERS_KEY, JSON.stringify(updated)); } catch(e){}
  };
  const deletePlayer = async (id) => {
    const updated = savedPlayers.filter(p=>p.id!==id);
    setSavedPlayers(updated);
    try { await fbSet(PLAYERS_KEY, JSON.stringify(updated)); } catch(e){}
  };
  const saveCourse = async (course) => {
    const updated = courses.some(c=>c.id===course.id) ? courses.map(c=>c.id===course.id?course:c) : [...courses,course];
    setCourses(updated);
    try { await fbSet(COURSES_KEY, JSON.stringify(updated)); } catch(e){}
  };
  const deleteCourse = async (id) => {
    const updated = courses.filter(c=>c.id!==id);
    setCourses(updated);
    try { await fbSet(COURSES_KEY, JSON.stringify(updated)); } catch(e){}
  };

  if (loading) return <div className="loading-screen"><div className="spinner">⛳</div><p>Cargando...</p></div>;

  return (
    <>
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0}
        body{font-family:'Georgia',serif}
        :root{
          --green-dark:#1a3a2a;--green-mid:#2d6a4f;--green-light:#74c69d;
          --green-pale:#d8f3dc;--fairway:#f0f7f2;--white:#ffffff;
          --text:#1a2e1f;--muted:#6b8f71;
          --eagle-color:#b5179e;--birdie-color:#3a86ff;--par-color:#2d6a4f;
          --bogey-color:#f4a261;--double-color:#e63946;
        }
        .loading-screen{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;background:var(--green-dark);color:white;gap:16px}
        .spinner{font-size:3rem;animation:spin 2s linear infinite}
        @keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}

        /* Modal */
        .modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:100;display:flex;align-items:flex-start;justify-content:center;padding:20px;overflow-y:auto}
        .modal-box{background:var(--fairway);border-radius:14px;width:100%;max-width:720px;box-shadow:0 20px 60px rgba(0,0,0,0.3)}
        .modal-header{display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:2px solid var(--green-pale)}
        .modal-header h2{font-size:1.05rem;color:var(--green-dark)}
        .btn-icon{background:none;border:none;font-size:1.1rem;cursor:pointer;color:var(--muted);padding:4px 8px;border-radius:4px}
        .btn-icon:hover{background:var(--green-pale)}
        .modal-body{padding:16px 20px 20px}
        .modal-actions-top{display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap}
        .empty-state{text-align:center;padding:32px;color:var(--muted)}
        .empty-state p{margin-top:8px}
        .hist-meta{display:flex;gap:12px;font-size:0.82rem;color:var(--muted);margin-bottom:14px}
        .hist-leaderboard{display:flex;flex-direction:column;gap:8px}

        /* Confirm */
        .confirm-box{background:white;border-radius:12px;padding:24px;max-width:360px;width:100%;box-shadow:0 8px 32px rgba(0,0,0,0.2)}
        .confirm-box p{color:var(--text);font-size:0.95rem;margin-bottom:20px;line-height:1.5}
        .confirm-actions{display:flex;justify-content:flex-end;gap:10px}
        .btn-danger{background:#e63946;color:white;border:none;border-radius:6px;padding:8px 18px;font-size:0.9rem;cursor:pointer;font-family:inherit}
        .btn-danger:hover{background:#c1121f}
        .btn-danger.small{padding:5px 12px;font-size:0.8rem}

        /* Course list */
        .course-list{display:flex;flex-direction:column;gap:10px}
        .course-card{background:white;border:1.5px solid #c5dfc9;border-radius:10px;padding:12px 14px;display:flex;align-items:center;gap:12px;flex-wrap:wrap}
        .course-card-info{flex:1;min-width:150px}
        .course-card-name{font-weight:700;color:var(--green-dark);font-size:0.95rem}
        .course-card-sub{font-size:0.75rem;color:var(--muted);margin-top:2px}
        .course-card-actions{display:flex;gap:6px;flex-wrap:wrap}
        .preset-card{background:#f8fcf9;border-color:#a8d5b5}
        .default-badge{margin-left:6px;font-size:0.7rem;background:#fff8dc;color:#b8860b;border-radius:8px;padding:1px 6px;font-weight:600}
        .btn-mini{padding:5px 10px;border-radius:6px;font-size:0.78rem;cursor:pointer;font-family:inherit;border:1.5px solid #c5dfc9;background:white;color:var(--text)}
        .btn-mini:hover{background:var(--green-pale)}
        .btn-mini.green{background:var(--green-dark);color:white;border-color:var(--green-dark)}
        .btn-mini.green:hover{background:var(--green-mid)}
        .btn-mini.red{background:#e63946;color:white;border-color:#e63946}
        .btn-mini.red-ghost{color:#e63946;border-color:#e63946}
        .btn-mini.red-ghost:hover{background:#fcd6d8}
        .edit-fields{display:flex;flex-direction:column;gap:12px}
        .edit-footer{display:flex;justify-content:space-between;align-items:center;margin-top:16px}
        .btn-primary.inline{width:auto;padding:10px 24px;margin-top:0;display:inline-block}
        .loaded-badge{margin-left:8px;font-size:0.75rem;background:var(--green-pale);color:var(--green-mid);border-radius:10px;padding:2px 8px;font-weight:600}
        .par-badge{margin-left:8px;font-size:0.75rem;background:#eee;color:var(--muted);border-radius:10px;padding:2px 8px}

        /* History banner */
        .history-btn{display:flex;align-items:center;gap:8px;width:100%;background:white;border:1.5px solid #c5dfc9;border-radius:10px;padding:12px 16px;margin-bottom:20px;cursor:pointer;font-family:inherit;font-size:0.9rem;color:var(--green-dark);text-align:left}
        .history-btn:hover{background:var(--green-pale)}
        .history-count{background:var(--green-dark);color:white;border-radius:10px;padding:1px 8px;font-size:0.75rem;font-weight:700}

        /* Setup */
        .setup-screen{max-width:760px;margin:0 auto;padding:32px 20px 60px;background:var(--fairway);min-height:100vh;width:100%}
        .setup-header{text-align:center;margin-bottom:36px}
        .logo-mark{font-size:3rem;margin-bottom:8px}
        .setup-header h1{font-size:2rem;color:var(--green-dark);letter-spacing:-0.5px}
        .setup-header p{color:var(--muted);margin-top:4px}
        .setup-section{margin-bottom:28px}
        .section-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:8px}
        .field-label{display:block;font-size:0.8rem;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:var(--green-mid);margin-bottom:8px}
        .text-input{width:100%;padding:10px 14px;border:2px solid #c5dfc9;border-radius:8px;font-size:0.95rem;font-family:inherit;background:white;color:var(--text);outline:none;transition:border-color 0.2s}
        .text-input:focus{border-color:var(--green-mid)}
        .flex-grow{flex:1}
        .players-grid{display:flex;flex-direction:column;gap:10px}
        .player-row{display:flex;align-items:center;gap:8px}
        .player-num{width:24px;text-align:center;font-size:0.85rem;color:var(--muted);font-weight:600}
        .hcp-field{display:flex;align-items:center;gap:4px}
        .hcp-label{font-size:0.75rem;color:var(--muted);white-space:nowrap}
        .number-input{width:60px;padding:10px 8px;text-align:center;border:2px solid #c5dfc9;border-radius:8px;font-size:0.95rem;font-family:inherit;background:white;color:var(--text);outline:none}
        .number-input:focus{border-color:var(--green-mid)}
        .btn-remove{background:none;border:none;color:#e63946;cursor:pointer;font-size:1rem;padding:6px;line-height:1;border-radius:4px}
        .btn-remove:hover{background:#fce4e6}
        .holes-table-wrap{overflow-x:auto}
        .holes-table{border-collapse:collapse;width:100%;font-size:0.78rem}
        .holes-table th,.holes-table td{padding:4px 5px;text-align:center;border:1px solid #c5dfc9;background:white}
        .holes-table thead th{background:var(--green-dark);color:white;font-size:0.72rem}
        .row-label{background:var(--green-pale) !important;font-weight:600;color:var(--green-dark);white-space:nowrap;padding:4px 8px !important}
        .cell-select{border:none;background:transparent;font-size:0.78rem;text-align:center;width:36px;cursor:pointer}
        .btn-ghost{background:none;border:1.5px solid var(--green-mid);color:var(--green-mid);border-radius:6px;padding:6px 14px;font-size:0.85rem;cursor:pointer;font-family:inherit}
        .btn-ghost:hover{background:var(--green-pale)}
        .btn-ghost.small{padding:4px 10px;font-size:0.8rem}
        .btn-ghost:disabled{opacity:0.4;cursor:default}
        .btn-primary{display:block;width:100%;padding:16px;background:var(--green-dark);color:white;border:none;border-radius:10px;font-size:1rem;font-family:inherit;cursor:pointer;font-weight:600;letter-spacing:0.02em;transition:background 0.2s;margin-top:8px}
        .btn-primary:hover{background:var(--green-mid)}
        .btn-primary:disabled{background:#aaa;cursor:default}
        .hint{text-align:center;font-size:0.82rem;color:var(--muted);margin-top:8px}

        /* Scorecard */
        .scorecard-screen{background:var(--fairway);min-height:100vh}
        .top-bar{background:var(--green-dark);color:white;padding:12px 16px;display:flex;align-items:center;gap:12px;flex-wrap:wrap}
        .round-name{font-size:0.9rem;font-weight:600;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .course-badge{font-size:0.8rem;font-weight:400;opacity:0.8}
        .tab-bar{display:flex;gap:4px;flex-wrap:wrap}
        .tab{background:none;border:1.5px solid rgba(255,255,255,0.4);color:rgba(255,255,255,0.8);border-radius:6px;padding:5px 12px;font-size:0.8rem;cursor:pointer;font-family:inherit}
        .tab.active{background:white;color:var(--green-dark);font-weight:600;border-color:white}
        .player-tabs{display:flex;gap:0;overflow-x:auto;background:var(--green-mid);border-bottom:2px solid var(--green-dark)}
        .player-tab{flex:0 0 auto;display:flex;flex-direction:column;align-items:center;padding:8px 14px;background:none;border:none;cursor:pointer;color:rgba(255,255,255,0.75);font-family:inherit;transition:background 0.15s;border-right:1px solid rgba(255,255,255,0.15);min-width:80px}
        .player-tab:hover{background:rgba(255,255,255,0.1)}
        .player-tab.active{background:var(--green-dark);color:white}
        .ptab-name{font-size:0.8rem;font-weight:600;white-space:nowrap;max-width:100px;overflow:hidden;text-overflow:ellipsis}
        .ptab-pts{font-size:0.7rem;margin-top:2px}
        .player-info-bar{display:flex;align-items:center;gap:12px;padding:10px 16px;background:white;border-bottom:1px solid #dde;flex-wrap:wrap}
        .pname{font-weight:700;color:var(--green-dark);font-size:1rem}
        .phcp{font-size:0.8rem;color:var(--muted);background:var(--green-pale);padding:2px 8px;border-radius:12px}
        .ptotal{font-size:0.85rem;color:var(--text);margin-left:auto}
        .legend{display:flex;gap:6px;padding:8px 16px;background:white;border-bottom:1px solid #dde;overflow-x:auto}
        .leg{font-size:0.7rem;padding:2px 8px;border-radius:10px;white-space:nowrap;font-weight:600}
        .eagle{background:#f3d6ef;color:var(--eagle-color)}
        .birdie{background:#dce9ff;color:var(--birdie-color)}
        .par{background:var(--green-pale);color:var(--par-color)}
        .bogey{background:#fde8d6;color:#c75b1a}
        .double{background:#fcd6d8;color:var(--double-color)}
        .tables-wrap{padding:12px 16px;display:flex;flex-direction:column;gap:16px}
        .half-table-wrap{overflow-x:auto}
        .half-label{font-size:0.75rem;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:var(--muted);margin-bottom:6px}
        .score-table{border-collapse:collapse;width:100%;font-size:0.78rem;min-width:360px}
        .score-table th,.score-table td{padding:5px 4px;text-align:center;border:1px solid #c5dfc9}
        .score-table thead th{background:var(--green-dark);color:white}
        .par-row th{background:#2a5b45 !important;font-size:0.72rem}
        .si-row th{background:#1f4733 !important;font-size:0.7rem;color:rgba(255,255,255,0.7)}
        .score-cell{background:white;padding:2px !important}
        .score-cell.eagle{background:#f3d6ef}
        .score-cell.birdie{background:#dce9ff}
        .score-cell.par{background:var(--green-pale)}
        .score-cell.bogey{background:#fde8d6}
        .score-cell.double{background:#fcd6d8}
        .score-input{width:100%;min-width:28px;text-align:center;border:none;background:transparent;font-size:0.85rem;font-family:inherit;color:var(--text);padding:4px 0;-moz-appearance:textfield}
        .score-input::-webkit-outer-spin-button,.score-input::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}
        .score-input:focus{outline:2px solid var(--green-mid);border-radius:3px}
        .score-input::placeholder{color:#bbb}
        .stableford-row td{background:#f0f7f2;font-size:0.78rem;font-weight:600}
        .pts-cell.eagle{background:#f3d6ef;color:var(--eagle-color)}
        .pts-cell.par{background:var(--green-pale);color:var(--par-color)}
        .pts-cell.bogey{background:#fde8d6;color:#c75b1a}
        .pts-cell.double{background:#fcd6d8;color:var(--double-color)}
        .total-cell{background:var(--green-dark) !important;color:white !important;font-weight:700}
        .stf-total{background:var(--green-mid) !important}
        .grand-total{display:flex;gap:12px;padding:16px;background:white;border-top:2px solid var(--green-dark);margin:0 16px 32px;border-radius:0 0 10px 10px}
        .gt-item{flex:1;text-align:center}
        .gt-item span{display:block;font-size:0.75rem;color:var(--muted);margin-bottom:4px}
        .gt-item strong{font-size:1.4rem;color:var(--green-dark)}
        .gt-item.highlight{background:var(--green-dark);border-radius:8px;padding:8px}
        .gt-item.highlight span{color:rgba(255,255,255,0.7)}
        .gt-item.highlight strong{color:white;font-size:1.6rem}
        .leaderboard{padding:20px 16px}
        .lb-title{font-size:1.1rem;color:var(--green-dark);margin-bottom:16px}
        .lb-row{display:flex;align-items:center;gap:14px;padding:14px 16px;background:white;border-radius:10px;margin-bottom:10px;border:1.5px solid #dde}
        .lb-row.leader{border-color:#f5c518;background:#fffbea}
        .lb-rank{font-size:1.2rem;font-weight:700;color:var(--muted);min-width:28px;text-align:center}
        .lb-info{flex:1}
        .lb-name{font-weight:600;color:var(--green-dark);font-size:1rem}
        .lb-sub{font-size:0.78rem;color:var(--muted);margin-top:2px}
        .lb-pts{font-size:1.6rem;font-weight:700;color:var(--green-dark)}
        .lb-pts span{font-size:0.75rem;color:var(--muted);font-weight:400}
        .group-block { background:white; border:1.5px solid #c5dfc9; border-radius:10px; padding:14px; margin-bottom:14px; }
        .group-header { display:flex; align-items:center; gap:8px; margin-bottom:12px; flex-wrap:wrap; }
        .group-name-input { flex:1; min-width:120px; font-weight:600; }
        .sort-row { display:flex; align-items:center; gap:6px; margin-bottom:10px; }
        .sort-label { font-size:0.75rem; color:var(--muted); }
        .btn-mini.active-sort { background:var(--green-dark); color:white; border-color:var(--green-dark); }
        .player-pick-input { cursor:pointer; background:#fafff9; }
        .player-pick-input:hover { border-color:var(--green-mid); }
        .hv-group-tabs { display:flex; overflow-x:auto; background:white; border-bottom:2px solid #dde; }
        .hv-group-tab { flex:1; padding:10px 14px; background:none; border:none; cursor:pointer; font-family:inherit; font-size:0.88rem; font-weight:600; color:var(--muted); border-bottom:3px solid transparent; white-space:nowrap; }
        .hv-group-tab:hover { background:var(--green-pale); }
        .hv-group-tab.active { color:var(--green-dark); border-bottom-color:var(--green-dark); background:var(--fairway); }
        .hdc-pct-row { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
        .hdc-pct-btn { padding:8px 16px; border-radius:8px; border:2px solid #c5dfc9; background:white; color:var(--text); font-size:0.9rem; font-family:inherit; cursor:pointer; font-weight:600; }
        .hdc-pct-btn:hover { background:var(--green-pale); }
        .hdc-pct-btn.active { background:var(--green-dark); color:white; border-color:var(--green-dark); }
        .custom-hdc-row { display:flex; gap:6px; align-items:center; }


        /* Match View */
        .match-view{padding:16px;display:flex;flex-direction:column;gap:14px}
        .match-header-info{background:var(--green-pale);border-radius:8px;padding:10px 14px;font-size:0.82rem;color:var(--green-dark)}
        .match-segment{background:white;border:1.5px solid #c5dfc9;border-radius:12px;overflow:hidden}
        .match-seg-header{display:flex;justify-content:space-between;align-items:center;padding:12px 14px;background:var(--green-dark);color:white}
        .match-seg-title{display:flex;flex-direction:column;gap:2px}
        .match-seg-num{font-weight:700;font-size:0.95rem}
        .match-seg-range{font-size:0.75rem;opacity:0.8}
        .match-seg-header .btn-mini{background:rgba(255,255,255,0.15);border-color:rgba(255,255,255,0.4);color:white}
        .match-seg-header .btn-mini:hover{background:rgba(255,255,255,0.25)}
        .match-no-config{padding:16px;text-align:center;color:var(--muted);font-size:0.85rem}
        .match-pairs-row{display:flex;align-items:center;gap:8px;padding:12px 14px}
        .match-pair-card{flex:1;border-radius:8px;padding:10px;text-align:center}
        .pair-a{background:#dce9ff}
        .pair-b{background:#fde8d6}
        .match-pair-label{font-size:0.7rem;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px}
        .match-pair-names{font-weight:700;font-size:0.9rem;color:var(--green-dark)}
        .match-vs{font-weight:900;font-size:1rem;color:var(--muted)}
        .match-modalidad{text-align:center;font-size:0.75rem;color:var(--muted);padding-bottom:8px}
        .match-result{display:flex;align-items:center;gap:8px;padding:10px 14px;background:var(--fairway);border-top:1px solid #dde}
        .match-score-box{flex:1;text-align:center;padding:10px;border-radius:10px;background:#eee}
        .match-score-box.winner{background:var(--green-dark);color:white}
        .match-score-num{font-size:2rem;font-weight:700;line-height:1}
        .match-score-lbl{font-size:0.7rem;margin-top:2px;opacity:0.8}
        .match-halved-box{flex:0 0 60px;text-align:center;font-size:0.78rem;color:var(--muted);font-weight:600}
        .match-winner-lbl{color:var(--green-dark);font-weight:700}
        .match-tie{color:var(--muted)}
        .match-hole-detail{border-top:1px solid #dde}
        .match-hole-row{display:flex;align-items:center;justify-content:space-between;padding:7px 14px;font-size:0.82rem;border-bottom:1px solid #f0f0f0}
        .match-hole-row.won-a{background:#dce9ff}
        .match-hole-row.won-b{background:#fde8d6}
        .match-hole-row.halved{background:var(--green-pale)}
        .match-hole-num{font-weight:600;color:var(--muted);font-size:0.75rem}
        .match-hole-scores{min-width:40px;text-align:center;font-weight:700;color:var(--green-dark)}
        .match-pair-editor{display:flex;gap:12px;margin-bottom:14px}
        .match-pair-col{flex:1;display:flex;flex-direction:column;gap:6px}
        .match-pair-col-label{font-size:0.75rem;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:2px}
        .pair-a-label{color:var(--birdie-color)}
        .pair-b-label{color:#c75b1a}
        .match-player-chip{padding:6px 10px;border-radius:8px;font-size:0.82rem;font-weight:600;cursor:pointer;text-align:center}
        .chip-a{background:#dce9ff;color:var(--birdie-color)}
        .chip-b{background:#fde8d6;color:#c75b1a}
        .chip-empty{background:#f0f0f0;color:#aaa;cursor:default}
        .match-player-list{display:flex;flex-direction:column;gap:8px;margin-bottom:16px;max-height:240px;overflow-y:auto}
        .match-player-option{display:flex;justify-content:space-between;align-items:center;padding:10px 12px;background:white;border:1.5px solid #dde;border-radius:8px}
        .match-player-option.in-a{border-color:var(--birdie-color);background:#f0f5ff}
        .match-player-option.in-b{border-color:#f4a261;background:#fff7f0}
        /* Hole View */
        .hole-view{padding:0 0 40px}
        .hv-progress-wrap{height:4px;background:#dde;width:100%}
        .hv-progress-bar{height:4px;background:var(--green-mid);transition:width 0.4s}
        .hv-hole-nav{display:flex;align-items:center;justify-content:space-between;padding:20px 20px 8px;background:white;border-bottom:1px solid #dde}
        .hv-hole-info{text-align:center}
        .hv-hole-num{font-size:1.6rem;font-weight:700;color:var(--green-dark)}
        .hv-hole-meta{font-size:0.82rem;color:var(--muted);margin-top:2px}
        .hv-nav-btn{background:none;border:2px solid #c5dfc9;color:var(--green-dark);border-radius:8px;width:44px;height:44px;font-size:1.6rem;cursor:pointer;line-height:1;display:flex;align-items:center;justify-content:center}
        .hv-nav-btn:hover:not(:disabled){background:var(--green-pale)}
        .hv-nav-btn:disabled{opacity:0.3;cursor:default}
        .hv-dots{display:flex;gap:5px;justify-content:center;padding:10px 16px;background:white;border-bottom:1px solid #dde;flex-wrap:wrap}
        .hv-dot{width:18px;height:18px;border-radius:50%;border:2px solid #c5dfc9;background:white;cursor:pointer;padding:0;transition:all 0.15s}
        .hv-dot.done{background:var(--green-light);border-color:var(--green-mid)}
        .hv-dot.active{border-color:var(--green-dark);transform:scale(1.25);background:var(--green-dark)}
        .hv-players{display:flex;flex-direction:column;gap:10px;padding:16px}
        .hv-player-card{background:white;border:2px solid #dde;border-radius:12px;padding:14px 16px;display:flex;align-items:center;gap:12px;transition:border-color 0.2s}
        .hv-player-card.eagle{border-color:var(--eagle-color);background:#fdf0fc}
        .hv-player-card.birdie{border-color:var(--birdie-color);background:#f0f5ff}
        .hv-player-card.par{border-color:var(--green-mid);background:var(--green-pale)}
        .hv-player-card.bogey{border-color:#f4a261;background:#fff7f0}
        .hv-player-card.double{border-color:#e63946;background:#fff0f1}
        .hv-player-left{flex:1;min-width:0}
        .hv-player-name{font-weight:700;color:var(--green-dark);font-size:1rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .hv-player-sub{font-size:0.75rem;color:var(--muted);margin-top:2px}
        .hv-score-area{display:flex;align-items:center;gap:8px}
        .hv-stepper{width:36px;height:36px;border-radius:8px;border:2px solid #c5dfc9;background:white;font-size:1.3rem;cursor:pointer;color:var(--green-dark);display:flex;align-items:center;justify-content:center;line-height:1;font-weight:600}
        .hv-stepper:hover{background:var(--green-pale);border-color:var(--green-mid)}
        .hv-score-wrap{display:flex;flex-direction:column;align-items:center;gap:3px;min-width:52px}
        .hv-score-input{width:52px;height:44px;text-align:center;border:2px solid #c5dfc9;border-radius:8px;font-size:1.4rem;font-weight:700;font-family:inherit;color:var(--green-dark);background:white;outline:none;-moz-appearance:textfield}
        .hv-score-input::-webkit-outer-spin-button,.hv-score-input::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}
        .hv-score-input:focus{border-color:var(--green-mid)}
        .hv-pts-badge{font-size:0.7rem;font-weight:700;padding:2px 6px;border-radius:8px;white-space:nowrap}
        .hv-pts-badge.eagle{background:#f3d6ef;color:var(--eagle-color)}
        .hv-pts-badge.par{background:var(--green-pale);color:var(--par-color)}
        .hv-pts-badge.bogey{background:#fde8d6;color:#c75b1a}
        .hv-pts-badge.double{background:#fcd6d8;color:var(--double-color)}
        .hv-next-btn{display:block;margin:4px 16px 0;width:calc(100% - 32px);padding:14px;border:none;border-radius:10px;background:#c5dfc9;color:var(--green-dark);font-size:1rem;font-weight:600;font-family:inherit;cursor:pointer;transition:all 0.2s}
        .hv-next-btn.ready{background:var(--green-dark);color:white}
        .hv-next-btn:hover{opacity:0.9}
        .hv-finish-hint{text-align:center;padding:16px;font-size:0.85rem;color:var(--muted)}


        /* Vegas */
        .vegas-header-card{background:var(--green-dark);color:white;border-radius:12px;padding:14px 16px;display:flex;justify-content:space-between;align-items:center}
        .vegas-title{font-size:1.1rem;font-weight:700}
        .vegas-subtitle{font-size:0.75rem;opacity:0.75;margin-top:2px}
        .vegas-valor-display{text-align:center;cursor:pointer;background:rgba(255,255,255,0.15);border-radius:8px;padding:6px 12px}
        .vegas-valor-display:hover{background:rgba(255,255,255,0.25)}
        .vegas-valor-num{font-size:1.2rem;font-weight:700}
        .vegas-valor-lbl{font-size:0.65rem;opacity:0.8}
        .vegas-valor-edit{display:flex;align-items:center;gap:6px}
        .vegas-winner{border:2px solid #f5c518 !important;background:#fffbea !important}
        .vegas-result{background:#f8fcf9;padding:12px 14px;border-top:1px solid #dde}
        .vegas-result-row{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px}
        .vegas-result-label{font-size:0.8rem;color:var(--muted)}
        .vegas-result-val{font-size:1rem;font-weight:700;color:var(--green-dark)}
        .vegas-soles{font-size:1.2rem;font-weight:700;color:var(--green-dark)}
        .vegas-soles.positive{color:#e63946}
        .vegas-paga{font-size:0.82rem;color:var(--green-mid);font-weight:600;margin-top:4px;text-align:center;padding:6px;background:var(--green-pale);border-radius:6px}
        .vegas-hole-header{display:flex;justify-content:space-between;padding:6px 14px;background:var(--green-pale);font-size:0.72rem;font-weight:700;color:var(--green-dark)}
        .vegas-grand-total{background:var(--green-dark);color:white;border-radius:12px;padding:16px;text-align:center}
        .vegas-gt-label{font-size:0.78rem;opacity:0.75;margin-bottom:4px}
        .vegas-gt-amount{font-size:2rem;font-weight:700}
        .vegas-gt-sub{font-size:0.78rem;opacity:0.8;margin-top:4px}
        /* ── Responsive Mobile ───────────────────────────────────────────── */
        @media (max-width: 600px) {
          .setup-screen{padding:16px 12px 60px;font-size:16px}
          .setup-header h1{font-size:1.6rem}
          .logo-mark{font-size:2.5rem}
          .text-input{font-size:1rem;padding:12px 14px}
          .field-label{font-size:0.85rem}
          .btn-primary{font-size:1rem;padding:16px}
          .btn-ghost{font-size:0.9rem;padding:8px 14px}
          .top-bar{padding:8px 10px;gap:6px}
          .round-name{font-size:0.78rem}
          .tab-bar{gap:3px;flex-wrap:wrap}
          .tab{padding:4px 8px;font-size:0.7rem;white-space:nowrap}
          .btn-ghost.small{padding:4px 7px;font-size:0.72rem}
          .player-tabs{scroll-snap-type:x mandatory}
          .player-tab{min-width:70px;padding:6px 10px;scroll-snap-align:start}
          .ptab-name{font-size:0.72rem;max-width:70px}
          .ptab-pts{font-size:0.65rem}
          .player-info-bar{padding:8px 10px;gap:8px}
          .pname{font-size:0.9rem}
          .ptotal{font-size:0.75rem;margin-left:0;width:100%}
          .tables-wrap{padding:8px 6px}
          .score-table{font-size:0.7rem;min-width:300px}
          .score-table th,.score-table td{padding:3px 2px}
          .score-input{font-size:0.78rem}
          .grand-total{margin:0 6px 20px;padding:10px}
          .gt-item strong{font-size:1.1rem}
          .gt-item.highlight strong{font-size:1.3rem}
          .leaderboard{padding:12px 10px}
          .lb-row{padding:10px 12px;gap:10px}
          .lb-name{font-size:0.9rem}
          .lb-pts{font-size:1.3rem}
          .lb-net{font-size:1.2rem}
          .hv-hole-nav{padding:12px 10px 6px}
          .hv-hole-num{font-size:1.3rem}
          .hv-players{padding:10px}
          .hv-player-card{padding:10px 12px;gap:8px}
          .hv-player-name{font-size:0.9rem}
          .hv-score-input{width:44px;height:40px;font-size:1.2rem}
          .hv-stepper{width:32px;height:32px;font-size:1.1rem}
          .hv-next-btn{margin:4px 10px 0;width:calc(100% - 20px)}
          .modal-box{margin:10px}
          .modal-body{padding:12px 14px 16px}
          .course-card{padding:10px 12px}
          .group-block{padding:10px}
          .match-view{padding:10px;gap:10px}
          .match-pairs-row{padding:10px}
          .match-score-num{font-size:1.6rem}
          .history-btn{padding:10px 12px;font-size:0.85rem}
          .hdc-pct-btn{padding:7px 12px;font-size:0.82rem}
          .number-input{width:52px;padding:8px 6px}
          .player-row{gap:6px}
          .section-header{gap:4px}
        }
      `}</style>

      {!session
        ? <SetupScreen onStart={startSession} courses={courses} onSaveCourse={saveCourse} onDeleteCourse={deleteCourse} history={history} onRestoreRound={restoreRound} onDeleteRound={deleteRound} savedPlayers={savedPlayers} onSavePlayer={savePlayer} onDeletePlayer={deletePlayer} defaultCourseId={defaultCourseId} onSetDefault={setDefaultCourse}/>
        : <ScorecardScreen session={session} onUpdate={updateSession} onFinish={finishSession} history={history} onRestoreRound={restoreRound} onDeleteRound={deleteRound}/>
      }

      {lastSaved && session && (
        <div style={{position:"fixed",bottom:12,right:12,background:"rgba(45,106,79,0.9)",color:"white",borderRadius:8,padding:"6px 12px",fontSize:"0.72rem"}}>
          ✓ Guardado · {lastSaved.toLocaleTimeString("es-ES",{hour:"2-digit",minute:"2-digit"})}
        </div>
      )}
    </>
  );
}
