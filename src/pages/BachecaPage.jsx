import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'

export default function BachecaPage() {
  const { profile, isAdmin } = useAuth()
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [content, setContent] = useState('')
  const [images, setImages] = useState([]) // array di File
  const [previews, setPreviews] = useState([]) // array di URL preview
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const fileInputRef = useRef()

  const canPost = isAdmin || profile?.role === 'coach'

  useEffect(() => { loadPosts() }, [])

  async function loadPosts() {
    setLoading(true)
    const { data } = await supabase
      .from('board_posts')
      .select(`*, author:profiles(id, full_name, role), board_post_images(id, storage_path)`)
      .order('created_at', { ascending: false })
    setPosts(data || [])
    setLoading(false)
  }

  function handleImageSelect(e) {
    const files = Array.from(e.target.files)
    if (!files.length) return
    setImages(prev => [...prev, ...files])
    const newPreviews = files.map(f => URL.createObjectURL(f))
    setPreviews(prev => [...prev, ...newPreviews])
  }

  function removeImage(idx) {
    setImages(prev => prev.filter((_, i) => i !== idx))
    setPreviews(prev => {
      URL.revokeObjectURL(prev[idx])
      return prev.filter((_, i) => i !== idx)
    })
  }

  async function savePost() {
    if (!content.trim() && images.length === 0) return
    setSaving(true)

    // Crea il post
    const { data: post, error } = await supabase
      .from('board_posts')
      .insert({ author_id: profile.id, content: content.trim() || null })
      .select()
      .single()

    if (error) { setSaving(false); return }

    // Carica le immagini su Supabase Storage se presenti
    if (images.length > 0) {
      for (const file of images) {
        const ext = file.name.split('.').pop()
        const path = `bacheca/${post.id}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
        const { error: uploadError } = await supabase.storage
          .from('board-images')
          .upload(path, file)
        if (!uploadError) {
          await supabase.from('board_post_images').insert({ post_id: post.id, storage_path: path })
        }
      }
    }

    setSaving(false)
    setContent('')
    setImages([])
    setPreviews(p => { p.forEach(u => URL.revokeObjectURL(u)); return [] })
    setShowForm(false)
    loadPosts()
  }

  async function deletePost(postId) {
    if (!window.confirm('Eliminare questo post?')) return
    // Elimina immagini dallo storage
    const post = posts.find(p => p.id === postId)
    if (post?.board_post_images?.length) {
      await supabase.storage
        .from('board-images')
        .remove(post.board_post_images.map(i => i.storage_path))
    }
    await supabase.from('board_posts').delete().eq('id', postId)
    loadPosts()
  }

  function canDelete(post) {
    if (isAdmin) return true
    return post.author_id === profile?.id
  }

  function formatDate(ts) {
    const d = new Date(ts)
    return d.toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' }) +
      ' ' + d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
  }

  function getImageUrl(path) {
    const { data } = supabase.storage.from('board-images').getPublicUrl(path)
    return data?.publicUrl
  }

  const roleLabel = (role) => {
    if (role === 'admin') return 'Admin'
    if (role === 'sostegno') return 'Sostegno'
    return 'Allenatore'
  }

  const roleBadgeClass = (role) => {
    if (role === 'admin') return 'badge-admin'
    if (role === 'sostegno') return 'badge-sostegno'
    return 'badge-coach'
  }

  return (
    <div style={{ maxWidth: 640, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={{ fontSize: 18, fontWeight: 600 }}>📌 Bacheca</div>
        {canPost && !showForm && (
          <button className="btn btn-primary btn-sm" onClick={() => setShowForm(true)}>
            + Nuovo post
          </button>
        )}
      </div>

      {/* Form nuovo post */}
      {showForm && canPost && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ fontWeight: 500, marginBottom: 12 }}>Nuovo post</div>
          <div className="field">
            <label>Testo (opzionale se aggiungi immagini)</label>
            <textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder="Scrivi un messaggio per il gruppo..."
              rows={4}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #ddd', borderRadius: 8, fontSize: 13, resize: 'vertical', fontFamily: 'inherit' }}
            />
          </div>

          {/* Preview immagini */}
          {previews.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
              {previews.map((url, i) => (
                <div key={i} style={{ position: 'relative' }}>
                  <img
                    src={url} alt=""
                    style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 8, border: '1px solid #e5e5e5' }}
                  />
                  <button
                    onClick={() => removeImage(i)}
                    style={{
                      position: 'absolute', top: -6, right: -6, width: 20, height: 20,
                      borderRadius: '50%', background: '#ef4444', color: '#fff',
                      border: 'none', cursor: 'pointer', fontSize: 12, lineHeight: 1,
                      display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}
                  >×</button>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="btn btn-secondary btn-sm" onClick={() => fileInputRef.current?.click()}>
              🖼️ Aggiungi immagine
            </button>
            <input
              ref={fileInputRef} type="file" accept="image/*" multiple
              style={{ display: 'none' }} onChange={handleImageSelect}
            />
            <button
              className="btn btn-primary btn-sm"
              onClick={savePost}
              disabled={(!content.trim() && images.length === 0) || saving}
            >
              {saving ? 'Pubblicazione...' : 'Pubblica'}
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => {
              setShowForm(false); setContent(''); setImages([])
              setPreviews(p => { p.forEach(u => URL.revokeObjectURL(u)); return [] })
            }}>
              Annulla
            </button>
          </div>
        </div>
      )}

      {/* Lista post */}
      {loading
        ? <p style={{ textAlign: 'center', color: '#aaa', fontSize: 13 }}>Caricamento...</p>
        : posts.length === 0
          ? <div className="card" style={{ textAlign: 'center', color: '#aaa', fontSize: 13, padding: 32 }}>
              Nessun post in bacheca. {canPost ? 'Crea il primo!' : ''}
            </div>
          : posts.map(post => (
            <div className="card" key={post.id} style={{ marginBottom: 12 }}>
              {/* Header post */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div>
                  <span style={{ fontWeight: 500, fontSize: 13 }}>{post.author?.full_name}</span>
                  {' '}
                  <span className={`badge ${roleBadgeClass(post.author?.role)}`}>
                    {roleLabel(post.author?.role)}
                  </span>
                  <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>{formatDate(post.created_at)}</div>
                </div>
                {canDelete(post) && (
                  <button className="btn btn-danger btn-sm" onClick={() => deletePost(post.id)}>
                    Elimina
                  </button>
                )}
              </div>

              {/* Testo */}
              {post.content && (
                <p style={{ fontSize: 13, color: '#1a1a1a', whiteSpace: 'pre-wrap', marginBottom: post.board_post_images?.length ? 10 : 0 }}>
                  {post.content}
                </p>
              )}

              {/* Immagini */}
              {post.board_post_images?.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {post.board_post_images.map(img => (
                    <a key={img.id} href={getImageUrl(img.storage_path)} target="_blank" rel="noopener noreferrer">
                      <img
                        src={getImageUrl(img.storage_path)} alt=""
                        style={{ width: 120, height: 120, objectFit: 'cover', borderRadius: 8, border: '1px solid #e5e5e5', cursor: 'pointer' }}
                      />
                    </a>
                  ))}
                </div>
              )}
            </div>
          ))
      }
    </div>
  )
}
