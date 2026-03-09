import { useState, useEffect, useCallback } from "react";
import api from "../services/api";

const TYPE_ICONS = { Ambulance:"🚑", FireTruck:"🚒", Police:"🚔", TowTruck:"🔧", HazMat:"☣️", FloodRescue:"🚤" };
const FUEL_BADGE = { EV:"badge-green", Diesel:"badge-muted", Petrol:"badge-orange", Hybrid:"badge-accent" };

export default function VehicleManager() {
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editVehicle, setEditVehicle] = useState(null);
  const [filter, setFilter] = useState("All");
  const [typeFilter, setTypeFilter] = useState("All");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    vehicleId:"", name:"", type:"Ambulance", fuelType:"Diesel",
    batteryLevel:100, fuelLevel:100, lat:"22.7196", lng:"75.8577",
    equipment:"", crew:2, registrationNo:"", notes:""
  });

  const fetchVehicles = useCallback(async () => {
    try {
      const res = await api.get("/vehicles");
      setVehicles(res.data);
    } catch(e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchVehicles(); }, [fetchVehicles]);

  const openAdd = () => {
    setEditVehicle(null);
    setForm({ vehicleId:"", name:"", type:"Ambulance", fuelType:"Diesel", batteryLevel:100, fuelLevel:100, lat:"22.7196", lng:"75.8577", equipment:"", crew:2, registrationNo:"", notes:"" });
    setError("");
    setShowModal(true);
  };

  const openEdit = (v) => {
    setEditVehicle(v);
    setForm({
      vehicleId: v.vehicleId, name: v.name||"", type: v.type, fuelType: v.fuelType,
      batteryLevel: v.batteryLevel??100, fuelLevel: v.fuelLevel??100,
      lat: v.location?.lat||"", lng: v.location?.lng||"",
      equipment: (v.equipment||[]).join(", "), crew: v.crew||2,
      registrationNo: v.registrationNo||"", notes: v.notes||""
    });
    setError("");
    setShowModal(true);
  };

  const handleSave = async () => {
    setSaving(true); setError("");
    try {
      const payload = {
        ...form,
        location: { lat: parseFloat(form.lat), lng: parseFloat(form.lng) },
        equipment: form.equipment.split(",").map(s=>s.trim()).filter(Boolean),
        batteryLevel: parseInt(form.batteryLevel),
        fuelLevel: parseInt(form.fuelLevel),
        crew: parseInt(form.crew)
      };
      if (editVehicle) {
        await api.put(`/vehicles/${editVehicle._id}`, payload);
      } else {
        await api.post("/vehicles", payload);
      }
      setShowModal(false);
      fetchVehicles();
    } catch(e) {
      setError(e.response?.data?.error || "Save failed");
    } finally { setSaving(false); }
  };

  const handleDelete = async (v) => {
    if (!window.confirm(`Delete ${v.name || v.vehicleId}?`)) return;
    try { await api.delete(`/vehicles/${v._id}`); fetchVehicles(); }
    catch(e) { alert(e.response?.data?.error || "Delete failed"); }
  };

  const handleMaintenance = async (v) => {
    try { await api.patch(`/vehicles/${v._id}/maintenance`); fetchVehicles(); }
    catch(e) { alert("Failed"); }
  };

  const filtered = vehicles.filter(v => {
    if (filter !== "All" && v.status !== filter) return false;
    if (typeFilter !== "All" && v.type !== typeFilter) return false;
    return true;
  });

  const stats = {
    total: vehicles.length,
    available: vehicles.filter(v=>v.status==="Available").length,
    assigned: vehicles.filter(v=>v.status==="Assigned").length,
    ev: vehicles.filter(v=>v.fuelType==="EV").length,
    maintenance: vehicles.filter(v=>v.status==="Maintenance").length,
  };

  const co2Saved = vehicles.reduce((s,v)=>s+(+v.totalCarbonSaved||0),0).toFixed(1);

  return (
    <div>
      {/* Stats */}
      <div className="stat-grid mb-20">
        <div className="stat-card card-accent"><div className="stat-label">Total Fleet</div><div className="stat-value" style={{color:"var(--accent)"}}>{stats.total}</div></div>
        <div className="stat-card card-green"><div className="stat-label">Available</div><div className="stat-value" style={{color:"var(--green)"}}>{stats.available}</div></div>
        <div className="stat-card"><div className="stat-label">Assigned</div><div className="stat-value" style={{color:"var(--orange)"}}>{stats.assigned}</div></div>
        <div className="stat-card"><div className="stat-label">EV Vehicles</div><div className="stat-value" style={{color:"var(--green)"}}>{stats.ev}</div><div className="stat-sub">Zero-emission fleet</div></div>
        <div className="stat-card co2-meter card-green"><div className="stat-label">🌱 Total CO₂ Saved</div><div className="stat-value" style={{color:"var(--green)",fontSize:26}}>{co2Saved}</div><div className="stat-sub">kg saved by EV fleet</div></div>
        <div className="stat-card"><div className="stat-label">Maintenance</div><div className="stat-value" style={{color:"var(--yellow)"}}>{stats.maintenance}</div></div>
      </div>

      {/* Toolbar */}
      <div className="flex-between flex-wrap gap-12 mb-16">
        <div className="flex gap-8 flex-wrap">
          {["All","Available","Assigned","Maintenance"].map(f=>(
            <button key={f} className={`btn btn-sm ${filter===f?"btn-primary":"btn-ghost"}`} onClick={()=>setFilter(f)}>{f}</button>
          ))}
          <select className="select" style={{width:"auto",padding:"6px 12px",fontSize:12}} value={typeFilter} onChange={e=>setTypeFilter(e.target.value)}>
            <option value="All">All Types</option>
            {["Ambulance","FireTruck","Police","TowTruck","HazMat","FloodRescue"].map(t=><option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <button className="btn btn-success" onClick={openAdd}>+ Add Vehicle</button>
      </div>

      {/* Vehicle table */}
      {loading ? <div style={{color:"var(--text-muted)",padding:40}}>Loading fleet…</div> : (
        <div className="card" style={{padding:0,overflow:"hidden"}}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Vehicle</th><th>Type</th><th>Fuel</th><th>Status</th>
                <th>Battery/Fuel</th><th>Crew</th><th>Trips</th><th>CO₂ Saved</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(v => (
                <tr key={v._id}>
                  <td>
                    <div style={{fontWeight:700,fontSize:14}}>{TYPE_ICONS[v.type]} {v.name||v.vehicleId}</div>
                    <div style={{fontSize:11,color:"var(--text-muted)"}}>{v.vehicleId} · {v.registrationNo}</div>
                  </td>
                  <td><span className="badge badge-muted">{v.type}</span></td>
                  <td><span className={`badge ${FUEL_BADGE[v.fuelType]||"badge-muted"}`}>{v.fuelType}</span></td>
                  <td>
                    <div className="flex gap-6" style={{alignItems:"center"}}>
                      <span className={`vehicle-status-dot ${v.status.toLowerCase()}`} />
                      <span style={{fontSize:12,fontWeight:600,color:v.status==="Available"?"var(--green)":v.status==="Assigned"?"var(--orange)":v.status==="Maintenance"?"var(--yellow)":"var(--text-muted)"}}>{v.status}</span>
                    </div>
                  </td>
                  <td style={{minWidth:120}}>
                    <div className="flex-between mb-4" style={{fontSize:11}}>
                      <span style={{color:"var(--text-muted)"}}>{v.fuelType==="EV"?"Battery":"Fuel"}</span>
                      <span style={{fontWeight:700,color:(v.batteryLevel??v.fuelLevel??100)<20?"var(--red)":"var(--text-primary)"}}>{v.batteryLevel??v.fuelLevel??100}%</span>
                    </div>
                    <div className="progress-bar progress-bar-sm">
                      <div className="fill" style={{width:`${v.batteryLevel??v.fuelLevel??100}%`,background:(v.batteryLevel??v.fuelLevel??100)<20?"var(--red)":(v.batteryLevel??v.fuelLevel??100)<50?"var(--yellow)":"var(--green)"}} />
                    </div>
                  </td>
                  <td style={{color:"var(--text-secondary)",fontWeight:600}}>{v.crew||"—"}</td>
                  <td style={{color:"var(--text-secondary)"}}>{v.totalTrips||0}</td>
                  <td style={{color:"var(--green)",fontWeight:600}}>{(+v.totalCarbonSaved||0).toFixed(1)} kg</td>
                  <td>
                    <div className="flex gap-6">
                      <button className="btn btn-ghost btn-sm" onClick={()=>openEdit(v)}>Edit</button>
                      {v.status!=="Maintenance" && <button className="btn btn-ghost btn-sm" style={{color:"var(--yellow)"}} onClick={()=>handleMaintenance(v)}>🔧</button>}
                      <button className="btn btn-ghost btn-sm" style={{color:"var(--red)"}} onClick={()=>handleDelete(v)}>✕</button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length===0 && <tr><td colSpan="9" style={{textAlign:"center",padding:40,color:"var(--text-muted)"}}>No vehicles found</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* Sustainability summary */}
      <div className="card mt-16" style={{background:"var(--green-dim)",borderColor:"rgba(0,230,118,0.3)"}}>
        <div style={{fontFamily:"var(--font-display)",fontWeight:700,color:"var(--green)",fontSize:16,marginBottom:12}}>🌱 Sustainability Dashboard</div>
        <div className="grid-4">
          <div><div className="label-xs">EV Fleet %</div><div style={{fontFamily:"var(--font-display)",fontSize:24,fontWeight:700,color:"var(--green)",marginTop:4}}>{vehicles.length?Math.round(stats.ev/vehicles.length*100):0}%</div></div>
          <div><div className="label-xs">Total CO₂ Saved</div><div style={{fontFamily:"var(--font-display)",fontSize:24,fontWeight:700,color:"var(--green)",marginTop:4}}>{co2Saved} kg</div></div>
          <div><div className="label-xs">Diesel Equivalent</div><div style={{fontFamily:"var(--font-display)",fontSize:24,fontWeight:700,color:"var(--orange)",marginTop:4}}>{(parseFloat(co2Saved)/0.22).toFixed(0)} km</div><div style={{fontSize:11,color:"var(--text-muted)"}}>diesel distance equivalent</div></div>
          <div><div className="label-xs">Trees Equivalent</div><div style={{fontFamily:"var(--font-display)",fontSize:24,fontWeight:700,color:"var(--green)",marginTop:4}}>{Math.round(parseFloat(co2Saved)/21.7)}</div><div style={{fontSize:11,color:"var(--text-muted)"}}>trees absorbing same CO₂/year</div></div>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={e=>{if(e.target===e.currentTarget)setShowModal(false)}}>
          <div className="modal">
            <div className="modal-title">
              {editVehicle ? "Edit Vehicle" : "Add New Vehicle"}
              <button className="btn btn-ghost btn-sm" onClick={()=>setShowModal(false)}>✕</button>
            </div>
            <div className="grid-2 gap-12">
              <div className="form-group"><label className="form-label">Vehicle ID *</label><input className="input" value={form.vehicleId} onChange={e=>setForm({...form,vehicleId:e.target.value})} placeholder="AMB-005" disabled={!!editVehicle} /></div>
              <div className="form-group"><label className="form-label">Display Name</label><input className="input" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="Ambulance Echo" /></div>
              <div className="form-group"><label className="form-label">Type *</label>
                <select className="select" value={form.type} onChange={e=>setForm({...form,type:e.target.value})}>
                  {["Ambulance","FireTruck","Police","TowTruck","HazMat","FloodRescue"].map(t=><option key={t}>{t}</option>)}
                </select>
              </div>
              <div className="form-group"><label className="form-label">Fuel Type</label>
                <select className="select" value={form.fuelType} onChange={e=>setForm({...form,fuelType:e.target.value})}>
                  {["EV","Diesel","Petrol","Hybrid"].map(t=><option key={t}>{t}</option>)}
                </select>
              </div>
              <div className="form-group"><label className="form-label">Battery Level (%)</label><input className="input" type="number" min="0" max="100" value={form.batteryLevel} onChange={e=>setForm({...form,batteryLevel:e.target.value})} /></div>
              <div className="form-group"><label className="form-label">Fuel Level (%)</label><input className="input" type="number" min="0" max="100" value={form.fuelLevel} onChange={e=>setForm({...form,fuelLevel:e.target.value})} /></div>
              <div className="form-group"><label className="form-label">Location Lat</label><input className="input" value={form.lat} onChange={e=>setForm({...form,lat:e.target.value})} placeholder="22.7196" /></div>
              <div className="form-group"><label className="form-label">Location Lng</label><input className="input" value={form.lng} onChange={e=>setForm({...form,lng:e.target.value})} placeholder="75.8577" /></div>
              <div className="form-group"><label className="form-label">Crew Count</label><input className="input" type="number" min="1" value={form.crew} onChange={e=>setForm({...form,crew:e.target.value})} /></div>
              <div className="form-group"><label className="form-label">Registration No</label><input className="input" value={form.registrationNo} onChange={e=>setForm({...form,registrationNo:e.target.value})} placeholder="MP09-EMG-005" /></div>
            </div>
            <div className="form-group"><label className="form-label">Equipment (comma-separated)</label><input className="input" value={form.equipment} onChange={e=>setForm({...form,equipment:e.target.value})} placeholder="Oxygen, Stretcher, Defibrillator" /></div>
            <div className="form-group"><label className="form-label">Notes</label><textarea className="input" rows={2} value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} /></div>
            {error && <div style={{color:"var(--red)",fontSize:13,marginBottom:12,padding:"8px 12px",background:"var(--red-dim)",borderRadius:"var(--radius-md)"}}>{error}</div>}
            <div className="flex gap-12 mt-16">
              <button className="btn btn-primary" style={{flex:1}} onClick={handleSave} disabled={saving}>{saving?"Saving…":"Save Vehicle"}</button>
              <button className="btn btn-ghost" onClick={()=>setShowModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
