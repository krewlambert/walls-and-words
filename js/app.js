const SUPABASE_URL  = 'https://qqfjctduvnufxqhkmvor.supabase.co'
const SUPABASE_ANON = 'sb_publishable_dXZ4Bi7GBQTJHhftINb0LA_52uYAuV5'
// ─────────────────────────────────────────────────────
// CONFIG — paste your Supabase credentials here
// ─────────────────────────────────────────────────────
const { createClient } = supabase
const db = createClient(SUPABASE_URL, SUPABASE_ANON)

// ── State ──────────────────────────────────────────
let activeBorough = 'all'
let selectedFile  = null

// ── DOM References ─────────────────────────────────
const grid        = document.getElementById('grid')
const loading     = document.getElementById('loading')
const empty       = document.getElementById('empty')
const dropZone    = document.getElementById('drop-zone')
const fileInput   = document.getElementById('file-input')
const previewImg  = document.getElementById('preview-img')
const boroughSel  = document.getElementById('borough-select')
const locationInp = document.getElementById('location-input')
const captionInp  = document.getElementById('caption-input')
const submitBtn   = document.getElementById('submit-btn')
const statusMsg   = document.getElementById('status-msg')
const toggleBtn   = document.getElementById('toggle-upload')
const uploadPanel = document.getElementById('upload-panel')
const lightbox    = document.getElementById('lightbox')

// ── Borough Navigation ─────────────────────────────
document.getElementById('borough-nav').addEventListener('click', e => {
  if (!e.target.dataset.borough) return
  document.querySelectorAll('nav button').forEach(b => b.classList.remove('active'))
  e.target.classList.add('active')
  activeBorough = e.target.dataset.borough
  loadImages()
})

// ── Toggle Upload Panel ────────────────────────────
toggleBtn.addEventListener('click', () => {
  uploadPanel.classList.toggle('open')
  toggleBtn.textContent = uploadPanel.classList.contains('open')
    ? '− Close'
    : '+ Submit a Find'
})

// ── File Selection & Drag-and-Drop ─────────────────
dropZone.addEventListener('click', () => fileInput.click())

dropZone.addEventListener('dragover', e => {
  e.preventDefault()
  dropZone.classList.add('dragover')
})

dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('dragover')
})

dropZone.addEventListener('drop', e => {
  e.preventDefault()
  dropZone.classList.remove('dragover')
  handleFileSelect(e.dataTransfer.files[0])
})

fileInput.addEventListener('change', e => {
  handleFileSelect(e.target.files[0])
})

function handleFileSelect(file) {
  if (!file) return
  selectedFile = file
  previewImg.src = URL.createObjectURL(file)
  previewImg.style.display = 'block'
  checkSubmitReady()
}

// ── Enable submit only when file + borough selected ─
boroughSel.addEventListener('change', checkSubmitReady)

function checkSubmitReady() {
  submitBtn.disabled = !(selectedFile && boroughSel.value)
}

// ── Submit Upload ──────────────────────────────────
submitBtn.addEventListener('click', async () => {
  submitBtn.disabled = true
  statusMsg.textContent = 'Compressing...'

  try {
    // Compress image in the browser before uploading
    const compressed = await imageCompression(selectedFile, {
      maxSizeMB: 0.4,
      maxWidthOrHeight: 1600
    })

    statusMsg.textContent = 'Uploading...'

    // Create a unique filename
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`

    // Upload to Supabase Storage
    const { error: uploadError } = await db.storage
      .from('images')
      .upload(filename, compressed, { contentType: 'image/jpeg' })

    if (uploadError) throw uploadError

    // Get the public URL of the uploaded file
    const { data: { publicUrl } } = db.storage
      .from('images')
      .getPublicUrl(filename)

    // Save metadata to the database
    const { error: dbError } = await db.from('submissions').insert({
      image_url: publicUrl,
      borough:   boroughSel.value,
      location:  locationInp.value.trim() || null,
      caption:   captionInp.value.trim()  || null
    })

    if (dbError) throw dbError

    // Reset the form
    statusMsg.textContent    = 'Submitted! ✓'
    selectedFile             = null
    previewImg.style.display = 'none'
    previewImg.src           = ''
    boroughSel.value         = ''
    locationInp.value        = ''
    captionInp.value         = ''
    fileInput.value          = ''
    submitBtn.disabled       = true

    setTimeout(() => { statusMsg.textContent = '' }, 3000)

    // Refresh grid
    loadImages()

  } catch (err) {
    statusMsg.textContent = 'Error: ' + err.message
    submitBtn.disabled = false
  }
})

// ── Load & Render Images ───────────────────────────
async function loadImages() {
  grid.innerHTML        = ''
  loading.style.display = 'block'
  empty.style.display   = 'none'

  let query = db
    .from('submissions')
    .select('*')
    .order('created_at', { ascending: false })

  if (activeBorough !== 'all') {
    query = query.eq('borough', activeBorough)
  }

  const { data, error } = await query

  loading.style.display = 'none'

  if (error || !data || data.length === 0) {
    empty.style.display = 'block'
    return
  }

  data.forEach(item => {
    const card = document.createElement('div')
    card.className = 'card'
    card.innerHTML = `
      <img src="${item.image_url}" loading="lazy" alt="${item.caption || ''}" />
      <div class="meta">
        <div class="borough-tag">${item.borough}</div>
        ${item.caption  ? `<div class="caption">${item.caption}</div>`       : ''}
        ${item.location ? `<div class="location-tag">${item.location}</div>` : ''}
      </div>
    `
    card.addEventListener('click', () => openLightbox(item))
    grid.appendChild(card)
  })
}

// ── Lightbox ───────────────────────────────────────
function openLightbox(item) {
  document.getElementById('lightbox-img').src             = item.image_url
  document.getElementById('lightbox-borough').textContent = item.borough
  document.getElementById('lightbox-caption').textContent = item.caption  || ''
  document.getElementById('lightbox-location').textContent = item.location || ''
  document.getElementById('lightbox-date').textContent    =
    new Date(item.created_at).toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric'
    })
  lightbox.classList.add('open')
}

document.getElementById('lightbox-close').addEventListener('click', () => {
  lightbox.classList.remove('open')
})

lightbox.addEventListener('click', e => {
  if (e.target === lightbox) lightbox.classList.remove('open')
})

// ── Init ───────────────────────────────────────────
loadImages()