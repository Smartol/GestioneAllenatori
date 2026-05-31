import { useState, useEffect, useRef } from 'react'
import { format, parseISO } from 'date-fns'
import { it } from 'date-fns/locale'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'

/* ============================================================
   LIGHTBOX
   ============================================================ */
function Lightbox({ images, startIndex = 0, caption, onClose }) {
  const [idx, setIdx] = useState(startIndex)
  const total = images.length
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'ArrowRight') setIdx(i => Math.min(i + 1, total - 1))
      if (e.key === 'ArrowLeft') setIdx(i => Math.max(i - 1, 0))
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [total, onClose])
  return (
    <div onClick={e => e.target === e.currentTarget && onClose()} style={{ position:'fixed', inset:0, zIndex:1000, background:'rgba(0,0,0,0.92)', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:16 }}>
      <button onClick={onClose} style={{ position:'absolute', top:16, right:16, background:'rgba(255,255,255,0.15)', border:'none', color:'#fff', borderRadius:'50%', width:36, height:36, fontSize:18, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>X</button>
      <img src={images[idx]} alt="" style={{ maxWidth:'90vw', maxHeight:'65vh', objectFit:'contain', borderRadius:8, boxShadow:'0 8px 40px rgba(0,0,0,0.6)' }} />
      {caption && <div style={{ marginTop:14, color:'rgba(255,255,255,0.85)', fontSize:13, maxWidth:480, textAlign:'center', lineHeight:1.5, whiteSpace:'pre-wrap', padding:'0 8px' }}>{caption}</div>}
      {total > 1 && (
        <div style={{ display:'flex', alignItems:'center', gap:16, marginTop:14 }}>
          <button onClick={() => setIdx(i => Math.max(i-1,0))} disabled={idx===0} style={{ background:'rgba(255,255,255,0.15)', border:'none', color:'#fff', borderRadius:'50%', width:40, height:40, fontSize:20, cursor:idx===0?'default':'pointer', opacity:idx===0?0.3:1, display:'flex', alignItems:'center', justifyContent:'center' }}>{'<'}</button>
          <span style={{ color:'rgba(255,255,255,0.6)', fontSize:12 }}>{idx+1} / {total}</span>
          <button onClick={() => setIdx(i => Math.min(i+1,total-1))} disabled={idx===total-1} style={{ background:'rgba(255,255,255,0.15)', border:'none', color:'#fff', borderRadius:'50%', width:40, height:40, fontSize:20, cursor:idx===total-1?'default':'pointer', opacity:idx===total-1?0.3:1, display:'flex', alignItems:'center', justifyContent:'center' }}>{'>'}</button>
        </div>
      )}
      {total > 1 && (
        <div style={{ display:'flex', gap:8, marginTop:12 }}>
          {images.map((src, i) => <img key={i} src={src} alt="" onClick={() => setIdx(i)} style={{ width:48, height:48, objectFit:'cover', borderRadius:6, cursor:'pointer', border:i===idx?'2px solid #fff':'2px solid transparent', opacity:i===idx?1:0.5 }} />)}
        </div>
      )}
    </div>
  )
}

/* ============================================================
   ABSENCE MODAL — aggiunta e modifica
   ============================================================ */
function AbsenceModal({ absence, onClose, onSaved }) {
  const { profile } = useAuth()
  const [dateFrom, setDateFrom] = useState(absence?.date_from || '')
  const [dateTo, setDateTo] = useState(absence?.date_to || '')
  const [note, setNote] = useState(absence?.note || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const today = new Date().toISOString().slice(0, 10)

  async function save() {
    if (!dateFrom || !dateTo) { setError('Seleziona entrambe le date.'); return }
    if (dateTo < dateFrom) { setError('La data di fine deve essere dopo quella di inizio.'); return }
    setError(''); setSaving(true)
    if (absence) {
      await supabase.from('absences')
        .update({ date_from: dateFrom, date_to: dateTo, note: note.trim() || null })
        .eq('id', absence.id)
    } else {
      await supabase.from('absences').insert({
        coach_id: profile.id,
        date_from: dateFrom,
        date_to: dateTo,
        absence_type: 'period',
        note: note.trim() || null,
      })
    }
    setSaving(false)
    onSaved()
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" style={{ maxWidth: 360 }}>
        <div className="modal-head" style={{ background: '#b91c1c' }}>
          <div className="modal-title">{absence ? '✏️ Modifica assenza' : '🚫 Nuova assenza'}</div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div style={{ background:'#fef3c7', border:'1px solid #fde68a', borderRadius:8, padding:'10px 12px', fontSize:12, color:'#92400e', marginBottom:16, lineHeight:1.5 }}>
            ℹ️ Usa questa funzione solo per giorni in cui non sei disponibile completamente.
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:12 }}>
            <div className="field" style={{ margin:0 }}>
              <label>Dal</label>
              <input type="date" value={dateFrom} min={today}
                onChange={e => { setDateFrom(e.target.value); setError('') }} />
            </div>
            <div className="field" style={{ margin:0 }}>
              <label>Al</label>
              <input type="date" value={dateTo} min={dateFrom || today}
                onChange={e => { setDateTo(e.target.value); setError('') }} />
            </div>
          </div>
          <div className="field">
            <label>Nota (opzionale)</label>
            <input value={note} onChange={e => setNote(e.target.value)}
              placeholder="es. Vacanze, trasferta lavorativa..." />
          </div>
          {error && <p style={{ fontSize:12, color:'#b91c1c', marginBottom:8 }}>{error}</p>}
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={save} disabled={!dateFrom || !dateTo || saving}
              style={{ flex:2, padding:'10px', borderRadius:8, border:'none', fontSize:13, fontWeight:600, cursor:(!dateFrom||!dateTo)?'default':'pointer', background:(!dateFrom||!dateTo)?'#e5e5e5':'#b91c1c', color:(!dateFrom||!dateTo)?'#aaa':'#fff' }}>
              {saving ? 'Salvataggio...' : absence ? 'Salva modifiche' : 'Aggiungi assenza'}
            </button>
            <button onClick={onClose} style={{ flex:1, padding:'10px', borderRadius:8, border:'1px solid #ddd', background:'#fff', fontSize:13, color:'#555', cursor:'pointer' }}>
              Annulla
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ============================================================
   BACHECA PAGE
   ============================================================ */
export default function BachecaPage() {
  const { profile, isAdmin } = useAuth()
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [content, setContent] = useState('')
  const [images, setImages] = useState([])
  const [previews, setPreviews] = useState([])
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editingPost, setEditingPost] = useState(null)

  const [absences, setAbsences] = useState([])
  const [absencesOpen, setAbsencesOpen] = useState(false)
  const [absencesLoading, setAbsencesLoading] = useState(false)
  const [absenceModal, setAbsenceModal] = useState(null) // null | 'new' | absence_obj

  const fileInputRef = useRef()
  const canPost = isAdmin || profile?.role === 'coach'

  useEffect(() => { loadPosts(); loadAbsences() }, [])

  async function loadPosts() {
    setLoading(true)
    const { data } = await supabase
      .from('board_posts')
      .select('*, author:profiles(id, full_name, role), board_post_images(id, storage_path)')
      .order('created_at', { ascending: false })
    setPosts(data || [])
    setLoading(false)
  }

  async function loadAbsences() {
    setAbsencesLoading(true)
    const today = new Date().toISOString().slice(0, 10)
    const { data } = await supabase
      .from('absences')
      .select('*, coach:profiles(id, full_name)')
      .eq('absence_type', 'period')
      .gte('date_to', today)
      .order('coach_id')
      .order('date_from')

    // Raggruppa giorni consecutivi dello stesso utente in periodi
    const grouped = []
    for (const ab of (data || [])) {
      const last = grouped[grouped.length - 1]
      if (
        last &&
        last.coach_id === ab.coach_id &&
        last.note === ab.note &&
        addOneDayStr(last.date_to) === ab.date_from
      ) {
        // Estendi il periodo
        last.date_to = ab.date_to
        last._ids.push(ab.id)
      } else {
        grouped.push({ ...ab, _ids: [ab.id] })
      }
    }
    setAbsences(grouped)
    setAbsencesLoading(false)
  }

  function addOneDayStr(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number)
    const dt = new Date(y, m-1, d+1)
    return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`
  }

  async function deleteAbsence(ab) {
    if (!window.confirm('Eliminare questo periodo di assenza?')) return
    const ids = ab._ids || [ab.id]
    for (const id of ids) await supabase.from('absences').delete().eq('id', id)
    loadAbsences()
  }

  function handleImageSelect(e) {
    const files = Array.from(e.target.files)
    if (!files.length) return
    setImages(prev => [...prev, ...files])
    setPreviews(prev => [...prev, ...files.map(f => URL.createObjectURL(f))])
  }

  function removeImage(idx) {
    setImages(prev => prev.filter((_, i) => i !== idx))
    setPreviews(prev => { URL.revokeObjectURL(prev[idx]); return prev.filter((_, i) => i !== idx) })
  }

  function resetForm() {
    setContent(''); setImages([])
    setPreviews(p => { p.forEach(u => URL.revokeObjectURL(u)); return [] })
    setShowForm(false); setEditingPost(null)
  }

  async function savePost() {
    if (!content.trim() && images.length === 0) return
    setSaving(true)
    if (editingPost) {
      await supabase.from('board_posts').update({ content: content.trim() || null }).eq('id', editingPost.id)
      for (const file of images) {
        const ext = file.name.split('.').pop()
        const path = 'bacheca/' + editingPost.id + '/' + Date.now() + '_' + Math.random().toString(36).slice(2) + '.' + ext
        const { error } = await supabase.storage.from('board-images').upload(path, file)
        if (!error) await supabase.from('board_post_images').insert({ post_id: editingPost.id, storage_path: path })
      }
    } else {
      const { data: post, error } = await supabase.from('board_posts')
        .insert({ author_id: profile.id, content: content.trim() || null }).select().single()
      if (error) { setSaving(false); return }
      for (const file of images) {
        const ext = file.name.split('.').pop()
        const path = 'bacheca/' + post.id + '/' + Date.now() + '_' + Math.random().toString(36).slice(2) + '.' + ext
        const { error: uploadError } = await supabase.storage.from('board-images').upload(path, file)
        if (!uploadError) await supabase.from('board_post_images').insert({ post_id: post.id, storage_path: path })
      }
    }
    setSaving(false); resetForm(); loadPosts()
  }

  async function deletePost(postId) {
    if (!window.confirm('Eliminare questo post?')) return
    const post = posts.find(p => p.id === postId)
    if (post?.board_post_images?.length) await supabase.storage.from('board-images').remove(post.board_post_images.map(i => i.storage_path))
    await supabase.from('board_posts').delete().eq('id', postId)
    loadPosts()
  }

  async function deletePostImage(postId, img) {
    await supabase.storage.from('board-images').remove([img.storage_path])
    await supabase.from('board_post_images').delete().eq('id', img.id)
    setEditingPost(prev => prev ? { ...prev, board_post_images: prev.board_post_images.filter(i => i.id !== img.id) } : null)
    loadPosts()
  }

  function startEdit(post) {
    setEditingPost(post); setContent(post.content || ''); setImages([]); setPreviews([]); setShowForm(true)
  }

  function canEdit(post) { return isAdmin || post.author_id === profile?.id }

  function getImageUrl(path) {
    const { data } = supabase.storage.from('board-images').getPublicUrl(path)
    return data?.publicUrl
  }

  function formatDate(ts) {
    const d = new Date(ts)
    return d.toLocaleDateString('it-IT', { day:'2-digit', month:'short', year:'numeric' }) + ' ' + d.toLocaleTimeString('it-IT', { hour:'2-digit', minute:'2-digit' })
  }

  function formatAbsenceDate(dateStr) {
    return format(parseISO(dateStr), 'd MMM yyyy', { locale: it })
  }

  const roleLabel = r => r === 'admin' ? 'Admin' : r === 'sostegno' ? 'Sostegno' : 'Allenatore'
  const roleBadgeClass = r => r === 'admin' ? 'badge-admin' : r === 'sostegno' ? 'badge-sostegno' : 'badge-coach'

  return (
    <>
      {/* Modal assenza */}
      {absenceModal !== null && (
        <AbsenceModal
          absence={absenceModal === 'new' ? null : absenceModal}
          onClose={() => setAbsenceModal(null)}
          onSaved={() => { setAbsenceModal(null); loadAbsences() }}
        />
      )}

      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
        <div style={{ fontSize:18, fontWeight:600 }}>📌 Bacheca</div>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <button
            onClick={() => setAbsencesOpen(o => !o)}
            style={{ fontSize:11, padding:'4px 10px', borderRadius:6, border:'1px solid #fecaca', background:absencesOpen?'#fecaca':'#fff5f5', color:'#b91c1c', cursor:'pointer', fontWeight:500 }}
          >
            🚫 Assenze{absences.length > 0 ? ` (${absences.length})` : ''}
          </button>
          {canPost && !showForm && (
            <button className="btn btn-primary btn-sm" onClick={() => setShowForm(true)}>+ Nuovo post</button>
          )}
        </div>
      </div>

      {/* Pannello assenze */}
      {absencesOpen && (
        <div className="card" style={{ marginBottom:16 }}>
          {absencesLoading ? (
            <p style={{ fontSize:12, color:'#aaa', textAlign:'center' }}>Caricamento...</p>
          ) : absences.length === 0 ? (
            <p style={{ fontSize:12, color:'#aaa', textAlign:'center', marginBottom:12 }}>Nessuna assenza dichiarata.</p>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:6, marginBottom:12 }}>
              {absences.map(ab => {
                const isMine = ab.coach_id === profile?.id
                return (
                  <div key={ab.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 12px', borderRadius:8, gap:10, background:isMine?'#fff5f5':'#fafafa', border:`1px solid ${isMine?'#fecaca':'#e5e5e5'}` }}>
                    <div style={{ flex:1, minWidth:0 }}>
                      <span style={{ fontSize:12, fontWeight:600, color:'#b91c1c' }}>{ab.coach?.full_name}</span>
                      <span style={{ fontSize:12, color:'#555', marginLeft:8 }}>
                        {ab.date_from === ab.date_to
                          ? formatAbsenceDate(ab.date_from)
                          : `${formatAbsenceDate(ab.date_from)} → ${formatAbsenceDate(ab.date_to)}`
                        }
                      </span>
                      {ab.note && <span style={{ fontSize:11, color:'#888', marginLeft:8 }}>— {ab.note}</span>}
                    </div>
                    {isMine && (
                      <div style={{ display:'flex', gap:4, flexShrink:0 }}>
                        <button
                          onClick={() => setAbsenceModal(ab)}
                          style={{ fontSize:11, padding:'3px 8px', borderRadius:5, border:'1px solid #e5e5e5', background:'#f8f8f7', color:'#555', cursor:'pointer' }}>
                          ✏️
                        </button>
                        <button
                          onClick={() => deleteAbsence(ab.id)}
                          style={{ fontSize:11, padding:'3px 8px', borderRadius:5, border:'1px solid #fecaca', background:'#fff', color:'#b91c1c', cursor:'pointer' }}>
                          Elimina
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
          {/* Bottone aggiungi in fondo */}
          <button
            onClick={() => setAbsenceModal('new')}
            style={{ width:'100%', padding:'8px', borderRadius:8, border:'1px dashed #fecaca', background:'#fff5f5', color:'#b91c1c', fontSize:12, fontWeight:500, cursor:'pointer' }}>
            + Aggiungi assenza
          </button>
        </div>
      )}

      {/* Form post */}
      {showForm && canPost && (
        <div className="card" style={{ marginBottom:20 }}>
          <div style={{ fontWeight:500, marginBottom:12 }}>{editingPost ? 'Modifica post' : 'Nuovo post'}</div>
          <div className="field">
            <label>Testo (opzionale se aggiungi immagini)</label>
            <textarea value={content} onChange={e => setContent(e.target.value)} placeholder="Scrivi un messaggio per il gruppo..." rows={4}
              style={{ width:'100%', padding:'8px 10px', border:'1px solid #ddd', borderRadius:8, fontSize:13, resize:'vertical', fontFamily:'inherit' }} />
          </div>
          {editingPost?.board_post_images?.length > 0 && (
            <div style={{ marginBottom:12 }}>
              <div style={{ fontSize:12, color:'#555', fontWeight:500, marginBottom:6 }}>Immagini esistenti</div>
              <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                {editingPost.board_post_images.map(img => (
                  <div key={img.id} style={{ position:'relative' }}>
                    <img src={getImageUrl(img.storage_path)} alt="" style={{ width:80, height:80, objectFit:'cover', borderRadius:8, border:'1px solid #e5e5e5' }} />
                    <button onClick={() => deletePostImage(editingPost.id, img)} style={{ position:'absolute', top:-6, right:-6, width:20, height:20, borderRadius:'50%', background:'#ef4444', color:'#fff', border:'none', cursor:'pointer', fontSize:12, display:'flex', alignItems:'center', justifyContent:'center' }}>x</button>
                  </div>
                ))}
              </div>
            </div>
          )}
          {previews.length > 0 && (
            <div style={{ display:'flex', flexWrap:'wrap', gap:8, marginBottom:12 }}>
              {previews.map((url, i) => (
                <div key={i} style={{ position:'relative' }}>
                  <img src={url} alt="" style={{ width:80, height:80, objectFit:'cover', borderRadius:8, border:'1px solid #e5e5e5' }} />
                  <button onClick={() => removeImage(i)} style={{ position:'absolute', top:-6, right:-6, width:20, height:20, borderRadius:'50%', background:'#ef4444', color:'#fff', border:'none', cursor:'pointer', fontSize:12, display:'flex', alignItems:'center', justifyContent:'center' }}>x</button>
                </div>
              ))}
            </div>
          )}
          <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
            <button className="btn btn-secondary btn-sm" onClick={() => fileInputRef.current?.click()}>Aggiungi immagine</button>
            <input ref={fileInputRef} type="file" accept="image/*" multiple style={{ display:'none' }} onChange={handleImageSelect} />
            <button className="btn btn-primary btn-sm" onClick={savePost} disabled={(!content.trim() && images.length === 0) || saving}>{saving ? 'Pubblicazione...' : editingPost ? 'Salva modifiche' : 'Pubblica'}</button>
            <button className="btn btn-secondary btn-sm" onClick={resetForm}>Annulla</button>
          </div>
        </div>
      )}

      {/* Lista post */}
      {loading
        ? <p style={{ textAlign:'center', color:'#aaa', fontSize:13 }}>Caricamento...</p>
        : posts.length === 0
          ? <div className="card" style={{ textAlign:'center', color:'#aaa', fontSize:13, padding:32 }}>Nessun post in bacheca. {canPost ? 'Crea il primo!' : ''}</div>
          : posts.map(post => (
            <PostCard key={post.id} post={post} canEdit={canEdit(post)}
              onEdit={() => startEdit(post)} onDelete={() => deletePost(post.id)}
              getImageUrl={getImageUrl} formatDate={formatDate}
              roleLabel={roleLabel} roleBadgeClass={roleBadgeClass} />
          ))
      }
    </>
  )
}

/* ============================================================
   POST CARD
   ============================================================ */
function PostCard({ post, canEdit, onEdit, onDelete, getImageUrl, formatDate, roleLabel, roleBadgeClass }) {
  const [lightbox, setLightbox] = useState(null)
  const imageUrls = (post.board_post_images || []).map(img => getImageUrl(img.storage_path)).filter(Boolean)
  return (
    <div className="card" style={{ marginBottom:12 }}>
      {lightbox && <Lightbox images={lightbox.urls} startIndex={lightbox.startIndex} caption={post.content} onClose={() => setLightbox(null)} />}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:10 }}>
        <div>
          <span style={{ fontWeight:500, fontSize:13 }}>{post.author?.full_name}</span>{' '}
          <span className={'badge ' + roleBadgeClass(post.author?.role)}>{roleLabel(post.author?.role)}</span>
          <div style={{ fontSize:11, color:'#aaa', marginTop:2 }}>{formatDate(post.created_at)}</div>
        </div>
        {canEdit && (
          <div style={{ display:'flex', gap:6 }}>
            <button onClick={onEdit} style={{ fontSize:12, padding:'4px 10px', borderRadius:6, border:'1px solid #e5e5e5', background:'#f8f8f7', color:'#555', cursor:'pointer' }}>Modifica</button>
            <button className="btn btn-danger btn-sm" onClick={onDelete}>Elimina</button>
          </div>
        )}
      </div>
      {post.content && <p style={{ fontSize:13, color:'#1a1a1a', whiteSpace:'pre-wrap', marginBottom:imageUrls.length?10:0 }}>{post.content}</p>}
      {imageUrls.length > 0 && (
        <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
          {imageUrls.map((url, i) => (
            <img key={i} src={url} alt="" onClick={() => setLightbox({ urls:imageUrls, startIndex:i })}
              style={{ width:120, height:120, objectFit:'cover', borderRadius:8, border:'1px solid #e5e5e5', cursor:'pointer' }}
              onMouseEnter={e => e.currentTarget.style.opacity='0.85'}
              onMouseLeave={e => e.currentTarget.style.opacity='1'} />
          ))}
        </div>
      )}
    </div>
  )
}