import { useState, useEffect, useRef } from 'react'
import { loadData, saveData, exportToFile, importFromFile } from './storage.js'

// ---- Constants ----

const TRACKS_CONFIG = [
  { key: 'tech_review',    label: 'Tech Review',         color: '#6366f1' },
  { key: 'legal_review',   label: 'Legal Review',         color: '#f59e0b' },
  { key: 'business_case',  label: 'Business Case',        color: '#10b981' },
  { key: 'pricing',        label: 'Pricing Negotiation',  color: '#ef4444' },
]

const TRACK_STATUSES = [
  { key: 'not_started', label: 'Not Started', color: '#94a3b8' },
  { key: 'in_progress', label: 'In Progress', color: '#3b82f6' },
  { key: 'blocked',     label: 'Blocked',     color: '#ef4444' },
  { key: 'done',        label: 'Done',        color: '#22c55e' },
]

// Stage → auto-probability mapping
const STAGE_PROBABILITY = {
  prospecting: 10, qualification: 20, needs_analysis: 30,
  sales_call_completed: 40, technical_alignment: 50,
  proposal: 70, contract_negotiation: 80,
}

// Deal Health thresholds (days since last activity)
const HEALTH_THRESHOLDS = { green: 7, yellow: 14, red: 30 }

function dealHealth(deal) {
  const days = daysAgo(deal.last_update_date || deal.updated_at)
  const hasNextStep = !!(deal.next_step && deal.next_step.trim())
  const nextStepOverdue = deal.next_step_date && new Date(deal.next_step_date) < new Date()

  if (nextStepOverdue) return { label: 'Overdue', color: '#ef4444', bg: '#fef2f2', icon: '⚠️', days }
  if (days == null || days <= HEALTH_THRESHOLDS.green) {
    if (hasNextStep) return { label: 'On Track', color: '#16a34a', bg: '#f0fdf4', icon: '🟢', days }
    return { label: 'Active', color: '#22c55e', bg: '#f0fdf4', icon: '🟢', days }
  }
  if (days <= HEALTH_THRESHOLDS.yellow) return { label: 'Needs Attention', color: '#f59e0b', bg: '#fffbeb', icon: '🟡', days }
  if (days <= HEALTH_THRESHOLDS.red) return { label: 'At Risk', color: '#ef4444', bg: '#fef2f2', icon: '🔴', days }
  return { label: 'Stale', color: '#64748b', bg: '#f1f5f9', icon: '⚫', days }
}

const COLUMNS_CONFIG = [
  { key: 'opportunity_name', label: 'Opportunity',   defaultVisible: true },
  { key: 'account_name',    label: 'Account',        defaultVisible: true },
  { key: 'stage',           label: 'Stage',          defaultVisible: true },
  { key: 'close_date',      label: 'Close Date',     defaultVisible: true },
  { key: 'new_arr',         label: 'Annual Deal Size', defaultVisible: true },
  { key: 'forecast',        label: 'Forecast',       defaultVisible: true },
  { key: 'added_arr',       label: 'Added ARR',      defaultVisible: true },
  { key: 'health',          label: 'Health',         defaultVisible: true },
  { key: 'probability',     label: 'Probability',    defaultVisible: false },
  { key: 'status',          label: 'Status',         defaultVisible: false },
  { key: 'type',            label: 'Type',           defaultVisible: false },
  { key: 'country',         label: 'Country',        defaultVisible: false },
  { key: 'tracks',          label: 'Tracks',         defaultVisible: false },
  { key: 'flowla',          label: 'Flowla',         defaultVisible: false },
  { key: 'last_update',     label: 'Last Update',    defaultVisible: false },
  { key: 'service_order',   label: 'Service Order',  defaultVisible: false },
  { key: 'contact',         label: 'Contact',        defaultVisible: false },
  { key: 'created',         label: 'Created',        defaultVisible: false },
]

const COUNTRIES = ['Argentina','Brazil','Chile','Colombia','Mexico','Peru','Ecuador','Uruguay','Paraguay','Bolivia','Venezuela','Costa Rica','Panama','Dominican Republic','Guatemala','USA','Canada','Spain','Other']

const SERVICE_ORDER_OPTIONS = ['N/A','Pending Review','Under Review','Approved','Rejected']

const SERVICE_ORDER_KEYS = { 'N/A': 'not_applicable', 'Pending Review': 'pending_review', 'Under Review': 'under_review', 'Approved': 'approved', 'Rejected': 'rejected' }
const SERVICE_ORDER_LABELS = Object.fromEntries(Object.entries(SERVICE_ORDER_KEYS).map(([l, k]) => [k, l]))

const FLOWLA_OPTIONS = ['None', 'Low', 'High']
const FLOWLA_KEYS = { 'None': 'none', 'Low': 'low', 'High': 'high' }
const FLOWLA_LABELS = { none: 'None', low: 'Low', high: 'High' }

const DEAL_STAGES = [
  { key: 'prospecting',          label: 'Prospecting' },
  { key: 'qualification',        label: 'Qualification' },
  { key: 'needs_analysis',       label: 'Needs Analysis' },
  { key: 'sales_call_completed', label: 'Sales Call Completed' },
  { key: 'technical_alignment',  label: 'Technical Alignment' },
  { key: 'proposal',             label: 'Proposal / Price Quote' },
  { key: 'contract_negotiation', label: 'Contract Negotiation' },
]

// Account status
const ACCOUNT_STATUSES = [
  { key: 'target',     label: 'Target',     color: '#6366f1', bg: '#eef2ff', desc: 'Identified, not yet contacted' },
  { key: 'prospecting', label: 'Prospecting', color: '#3b82f6', bg: '#eff6ff', desc: 'Actively reaching out' },
  { key: 'engaged',    label: 'Engaged',    color: '#f59e0b', bg: '#fffbeb', desc: 'In conversation' },
  { key: 'customer',   label: 'Customer',   color: '#22c55e', bg: '#f0fdf4', desc: 'Has active deal or won' },
  { key: 'churned',    label: 'Churned',    color: '#94a3b8', bg: '#f1f5f9', desc: 'Former customer' },
]

const INDUSTRIES = [
  'Retail / E-commerce', 'Fintech / Banking', 'Media / Entertainment', 'Telco',
  'Food & Beverage', 'Travel / Hospitality', 'Health / Pharma', 'Gaming',
  'Automotive', 'Education', 'Insurance', 'Real Estate', 'Other',
]

function accountStatusInfo(key) {
  return ACCOUNT_STATUSES.find(s => s.key === key) || ACCOUNT_STATUSES[0]
}

const LEAD_STAGES = [
  { key: 'new',             label: 'New',             color: '#6366f1', bg: '#eef2ff' },
  { key: 'researching',     label: 'Researching',     color: '#8b5cf6', bg: '#f5f3ff' },
  { key: 'engaging',        label: 'Engaging',        color: '#3b82f6', bg: '#eff6ff' },
  { key: 'nurturing',       label: 'Nurturing',       color: '#f59e0b', bg: '#fffbeb' },
  { key: 'qualified',       label: 'Qualified',       color: '#22c55e', bg: '#f0fdf4' },
  { key: 'converted',       label: 'Converted',       color: '#16a34a', bg: '#dcfce7' },
  { key: 'not_interested',  label: 'Not Interested',  color: '#94a3b8', bg: '#f1f5f9' },
]

const LEAD_SOURCES = [
  { key: 'outbound', label: 'Outbound',  color: '#3b82f6' },
  { key: 'inbound',  label: 'Inbound',   color: '#22c55e' },
  { key: 'referral', label: 'Referral',   color: '#f59e0b' },
  { key: 'event',    label: 'Event',      color: '#8b5cf6' },
]

function leadStageInfo(key) {
  return LEAD_STAGES.find(s => s.key === key) || LEAD_STAGES[0]
}

function leadSourceInfo(key) {
  return LEAD_SOURCES.find(s => s.key === key) || LEAD_SOURCES[0]
}

const DEFAULT_DATA = {
  accounts: [],
  deals: [],
  scores: {},
  tracks: [],
  leads: [],
  settings: { quota_target: 0, quota_quarter: 'Q2 2026' },
}

const SEED_DEALS = [
  { opportunity_name: 'BEES (Brasil) - Renewal 2026/27', account_name: 'BEES (Brasil)', stage: 'contract_negotiation', close_date: '2026-06-30', new_arr: 70650, added_arr: 9650, type: 'upsell', country: 'Brazil' },
  { opportunity_name: 'Pepe Ganga CO', account_name: 'Pepe Ganga CO', stage: 'contract_negotiation', close_date: '2026-06-30', new_arr: 29400, added_arr: 29400, type: 'new_business', country: 'Colombia' },
  { opportunity_name: 'Auto Mercado Renewal 2026/2027', account_name: 'Auto Mercado (Costa Rica)', stage: 'sales_call_completed', close_date: '2026-06-30', new_arr: 10992, added_arr: 2592, type: 'upsell', country: 'Costa Rica' },
  { opportunity_name: 'Tu Drogueria Virtual | Web & App', account_name: 'Unidrogas - Tu Drogueria', stage: 'technical_alignment', close_date: '2026-05-31', new_arr: 20544, added_arr: 20544, type: 'new_business', country: 'Colombia' },
  { opportunity_name: 'Borgata App (BetMGM) | 100K MAU', account_name: 'BetMGM', stage: 'technical_alignment', close_date: '2026-06-30', new_arr: 36000, added_arr: 36000, type: 'new_business', country: 'USA' },
  { opportunity_name: 'JCA Group - App&Web', account_name: 'Grupo JCA', stage: 'sales_call_completed', close_date: '2026-06-30', new_arr: 47500, added_arr: 47500, type: 'new_business', country: 'Brazil' },
  { opportunity_name: 'Banco BMG 1M MAU + 100K PV', account_name: 'Banco BMG', stage: 'contract_negotiation', close_date: '2026-09-30', new_arr: 92100, added_arr: 92100, type: 'new_business', country: 'Brazil' },
]

// ---- Helpers ----

function genId() { return crypto.randomUUID() }

function fmtMoney(n) {
  if (!n && n !== 0) return '$0'
  return '$' + Number(n).toLocaleString()
}

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function daysAgo(dateStr) {
  if (!dateStr) return null
  return Math.floor((Date.now() - new Date(dateStr)) / 86400000)
}

function calcProbFromStage(stage) {
  return STAGE_PROBABILITY[stage] || 0
}

function probColor(p) {
  if (p >= 75) return '#22c55e'
  if (p >= 50) return '#f59e0b'
  if (p >= 25) return '#f97316'
  return '#ef4444'
}

function forecastCat(p) {
  if (p >= 91) return { label: 'Closed',    color: '#22c55e' }
  if (p >= 51) return { label: 'Commit',    color: '#6366f1' }
  if (p >= 26) return { label: 'Best Case', color: '#3b82f6' }
  return           { label: 'Pipeline',  color: '#94a3b8' }
}

function statusInfo(s) {
  if (s === 'open')        return { label: 'Open', color: '#2563eb', bg: '#eff6ff' }
  if (s === 'closed_won')  return { label: 'Won',  color: '#16a34a', bg: '#f0fdf4' }
  return                          { label: 'Lost', color: '#dc2626', bg: '#fef2f2' }
}

function createTrackRows(dealId) {
  return TRACKS_CONFIG.map(t => ({
    id: genId(),
    opportunity_id: dealId,
    track_name: t.key,
    status: 'not_started',
    updated_at: new Date().toISOString(),
  }))
}

function defaultScores() {
  return {}
}

function defaultCols() {
  return Object.fromEntries(COLUMNS_CONFIG.map(c => [c.key, c.defaultVisible]))
}

// ---- Shared styles ----

const btnPrimary = {
  background: '#6366f1', color: '#fff', border: 'none', borderRadius: 6,
  padding: '8px 16px', cursor: 'pointer', fontWeight: 500, fontSize: 14,
}
const btnSecondary = {
  background: '#fff', color: '#374151', border: '1px solid #e2e8f0', borderRadius: 6,
  padding: '8px 16px', cursor: 'pointer', fontSize: 14,
}
const btnDanger = {
  background: '#ef4444', color: '#fff', border: 'none', borderRadius: 6,
  padding: '8px 16px', cursor: 'pointer', fontWeight: 500, fontSize: 14,
}
const cardStyle = {
  background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 16,
}
const overlayStyle = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  zIndex: 1000, padding: 16, overflowY: 'auto',
}

// ---- Main App ----

export default function App() {
  const [data, setData] = useState(DEFAULT_DATA)
  const [activeTab, setActiveTab] = useState('pipeline')
  const [statusFilter, setStatusFilter] = useState('open')
  const [sort, setSort] = useState({ field: 'account_name', dir: 'asc' })
  const [visibleCols, setVisibleCols] = useState(defaultCols)
  const [showColsDropdown, setShowColsDropdown] = useState(false)
  const [showNewDeal, setShowNewDeal] = useState(false)
  const [editDeal, setEditDeal] = useState(null)
  const [selectedDealId, setSelectedDealId] = useState(null)
  const [deletingDealId, setDeletingDealId] = useState(null)
  const [showQuota, setShowQuota] = useState(false)

  // Account state
  const [showNewAccount, setShowNewAccount] = useState(false)
  const [editAccount, setEditAccount] = useState(null)
  const [selectedAccountId, setSelectedAccountId] = useState(null)
  const [prospectingSubTab, setProspectingSubTab] = useState('accounts')

  // Gmail state
  const [gmailConnected, setGmailConnected] = useState(false)
  const [gmailEmail, setGmailEmail] = useState('')
  const [gmailToken, setGmailToken] = useState('')

  // Lead state
  const [showNewLead, setShowNewLead] = useState(false)
  const [editLeadData, setEditLeadData] = useState(null)
  const [selectedLeadId, setSelectedLeadId] = useState(null)
  const [deletingLeadId, setDeletingLeadId] = useState(null)
  const [leadStageFilter, setLeadStageFilter] = useState('active')
  const [leadSort, setLeadSort] = useState({ field: 'created_at', dir: 'desc' })
  const [convertingLead, setConvertingLead] = useState(null)
  const [newLeadPrefill, setNewLeadPrefill] = useState(null)
  const [newDealPrefill, setNewDealPrefill] = useState(null)

  useEffect(() => {
    const saved = loadData()
    if (saved) {
      let merged = { ...DEFAULT_DATA, ...saved }
      // Migrate: auto-calc probability from stage for existing deals missing it
      if (merged.deals && merged.deals.length > 0) {
        merged.deals = merged.deals.map(d => ({
          ...d,
          opportunity_name: d.opportunity_name || d.account_name || '',
          stage: d.stage || 'prospecting',
          close_date: d.close_date || '',
          added_arr: d.added_arr || 0,
          probability: (d.probability && d.probability > 0) ? d.probability : calcProbFromStage(d.stage || 'prospecting'),
          activities: d.activities || [],
          next_step: d.next_step || '',
          next_step_date: d.next_step_date || '',
        }))
      }
      // One-time merge: add seed deals that don't exist yet (by opportunity_name)
      const existingNames = new Set((merged.deals || []).map(d => d.opportunity_name || d.account_name))
      const missingSeedDeals = SEED_DEALS.filter(s => !existingNames.has(s.opportunity_name))
      if (missingSeedDeals.length > 0) {
        const now = new Date().toISOString()
        missingSeedDeals.forEach(seed => {
          const id = genId()
          merged.deals.push({
            id, ...seed, contact_name: '', deal_status: 'open', probability: calcProbFromStage(seed.stage),
            next_step: '', next_step_date: '', activities: [],
            last_meeting_date: '', last_update_note: '', last_update_date: '',
            service_order_status: 'not_applicable', flowla_engagement: 'none',
            flowla_url: '', notes: '', created_at: now, updated_at: now,
          })
          merged.tracks = [...(merged.tracks || []), ...createTrackRows(id)]
          merged.scores = { ...(merged.scores || {}), [id]: defaultScores() }
        })
      }
      // Seed pipeline deals if totally empty
      if (!merged.deals || merged.deals.length === 0) {
        const now = new Date().toISOString()
        const seededDeals = []
        const seededTracks = []
        const seededScores = {}
        SEED_DEALS.forEach(seed => {
          const id = genId()
          seededDeals.push({
            id, ...seed, contact_name: '', deal_status: 'open', probability: calcProbFromStage(seed.stage),
            next_step: '', next_step_date: '', activities: [],
            last_meeting_date: '', last_update_note: '', last_update_date: '',
            service_order_status: 'not_applicable', flowla_engagement: 'none',
            flowla_url: '', notes: '', created_at: now, updated_at: now,
          })
          seededTracks.push(...createTrackRows(id))
          seededScores[id] = defaultScores()
        })
        merged = { ...merged, deals: seededDeals, tracks: [...(merged.tracks || []), ...seededTracks], scores: { ...merged.scores, ...seededScores } }
      }
      setData(migrateAccounts(merged))
    } else {
      // First time: seed with deals
      const now = new Date().toISOString()
      const seededDeals = []
      const seededTracks = []
      const seededScores = {}
      SEED_DEALS.forEach(seed => {
        const id = genId()
        seededDeals.push({
          id, ...seed, contact_name: '', deal_status: 'open', probability: calcProbFromStage(seed.stage),
          next_step: '', next_step_date: '', activities: [],
          last_meeting_date: '', last_update_note: '', last_update_date: '',
          service_order_status: 'not_applicable', flowla_engagement: 'none',
          flowla_url: '', notes: '', created_at: now, updated_at: now,
        })
        seededTracks.push(...createTrackRows(id))
        seededScores[id] = defaultScores()
      })
      setData(migrateAccounts({ ...DEFAULT_DATA, deals: seededDeals, tracks: seededTracks, scores: seededScores }))
    }
    // Auto-create accounts from existing deals and leads (one-time migration)
    // This is now a function that works on whatever data we're about to setData with
    function migrateAccounts(d) {
      if (!d.accounts) d.accounts = []
      if (!d.settings) d.settings = {}
      if (d.settings._accounts_migrated) return d // already migrated
      const now = new Date().toISOString()
      const accountMap = new Map() // name → account
      // Create accounts from deals
      ;(d.deals || []).forEach(deal => {
        const name = deal.account_name
        if (name && !accountMap.has(name)) {
          const id = genId()
          accountMap.set(name, {
            id, name, industry: '', country: deal.country || '',
            website: '', company_size: '',
            status: 'customer', // existing deals = already in pipeline, not in prospecting
            notes: '', created_at: now, updated_at: now,
          })
        }
        if (name && accountMap.has(name)) deal.account_id = accountMap.get(name).id
      })
      // Create accounts from leads (if company not already an account)
      ;(d.leads || []).forEach(lead => {
        const name = lead.company
        if (name && !accountMap.has(name)) {
          const id = genId()
          accountMap.set(name, {
            id, name, industry: lead.industry || '', country: lead.country || '',
            website: '', company_size: lead.company_size || '',
            status: 'prospecting',
            notes: '', created_at: now, updated_at: now,
          })
        }
        if (name && accountMap.has(name)) lead.account_id = accountMap.get(name).id
      })
      d.accounts = [...accountMap.values()]
      d.settings._accounts_migrated = true
      return d
    }

    // Reset column visibility to pick up new columns
    setVisibleCols(defaultCols())
    // Load Gmail tokens from localStorage
    const savedGmail = localStorage.getItem('storyly_gmail')
    if (savedGmail) {
      try {
        const g = JSON.parse(savedGmail)
        if (g.refresh_token) { setGmailToken(g.refresh_token); setGmailEmail(g.email || ''); setGmailConnected(true) }
      } catch {}
    }
  }, [])

  // Listen for Gmail OAuth callback
  useEffect(() => {
    function handleMessage(event) {
      if (event.data?.type === 'gmail_auth_success' && event.data.refresh_token) {
        setGmailToken(event.data.refresh_token)
        setGmailEmail(event.data.email || '')
        setGmailConnected(true)
        localStorage.setItem('storyly_gmail', JSON.stringify({
          refresh_token: event.data.refresh_token,
          email: event.data.email || '',
        }))
      }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [])

  function connectGmail() {
    window.open('/api/gmail/auth', 'gmail_auth', 'width=500,height=700,left=200,top=100')
  }

  function disconnectGmail() {
    setGmailToken(''); setGmailEmail(''); setGmailConnected(false)
    localStorage.removeItem('storyly_gmail')
  }

  async function fetchGmailEmails(contactEmail) {
    if (!gmailToken || !contactEmail) return []
    try {
      const res = await fetch('/api/gmail/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: gmailToken, query: contactEmail }),
      })
      const data = await res.json()
      return data.messages || []
    } catch {
      return []
    }
  }

  const saveRef = useRef(null)
  const dataRef = useRef(data)
  dataRef.current = data // always keep ref in sync

  useEffect(() => {
    clearTimeout(saveRef.current)
    saveRef.current = setTimeout(() => saveData(data), 400)
    return () => clearTimeout(saveRef.current)
  }, [data])

  // Flush pending save immediately on page unload (prevents data loss on refresh)
  useEffect(() => {
    function handleBeforeUnload() {
      clearTimeout(saveRef.current)
      saveData(dataRef.current)
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [])

  // ---- Handlers ----

  // Account handlers
  function addAccount(form) {
    const id = genId()
    const now = new Date().toISOString()
    const account = {
      id,
      name: form.name || '',
      industry: form.industry || '',
      country: form.country || '',
      website: form.website || '',
      company_size: form.company_size || '',
      status: form.status || 'target',
      notes: form.notes || '',
      created_at: now,
      updated_at: now,
    }
    setData(d => ({ ...d, accounts: [...(d.accounts || []), account] }))
    return id
  }

  function updateAccount(id, form) {
    setData(d => ({
      ...d,
      accounts: (d.accounts || []).map(a => a.id !== id ? a : {
        ...a, ...form, updated_at: new Date().toISOString(),
      }),
    }))
  }

  function deleteAccount(id) {
    setData(d => ({
      ...d,
      accounts: (d.accounts || []).filter(a => a.id !== id),
      // Unlink leads and deals but don't delete them
      leads: (d.leads || []).map(l => l.account_id === id ? { ...l, account_id: '' } : l),
      deals: d.deals.map(deal => deal.account_id === id ? { ...deal, account_id: '' } : deal),
    }))
  }

  // Account-aware lead adding
  function addLeadToAccount(accountId, form) {
    const account = (data.accounts || []).find(a => a.id === accountId)
    addLead({
      ...form,
      account_id: accountId,
      company: form.company || (account ? account.name : ''),
    })
  }

  function addDeal(form) {
    const id = genId()
    const now = new Date().toISOString()
    const deal = {
      id,
      opportunity_name: form.opportunity_name || '',
      account_id: form.account_id || '',
      account_name: form.account_name || '',
      contact_name: form.contact_name || '',
      stage: form.stage || 'prospecting',
      close_date: form.close_date || '',
      new_arr: Number(form.new_arr) || 0,
      added_arr: Number(form.added_arr) || 0,
      type: form.type || 'new_business',
      country: form.country || '',
      deal_status: form.deal_status || 'open',
      probability: calcProbFromStage(form.stage || 'prospecting'),
      next_step: form.next_step || '',
      next_step_date: form.next_step_date || '',
      activities: [],
      last_meeting_date: form.last_meeting_date || '',
      last_update_note: form.last_update_note || '',
      last_update_date: form.last_update_date || '',
      service_order_status: form.service_order_status || 'not_applicable',
      flowla_engagement: form.flowla_engagement || 'none',
      flowla_url: form.flowla_url || '',
      notes: form.notes || '',
      created_at: now,
      updated_at: now,
    }
    setData(d => ({
      ...d,
      deals: [...d.deals, deal],
      tracks: [...d.tracks, ...createTrackRows(id)],
      scores: { ...d.scores, [id]: defaultScores() },
    }))
  }

  function updateDeal(id, form) {
    setData(d => ({
      ...d,
      deals: d.deals.map(deal => deal.id !== id ? deal : {
        ...deal, ...form,
        new_arr: Number(form.new_arr) || 0,
        added_arr: Number(form.added_arr) || 0,
        probability: form.stage ? calcProbFromStage(form.stage) : deal.probability,
        updated_at: new Date().toISOString(),
      }),
    }))
  }

  function addActivity(dealId, activity) {
    const now = new Date().toISOString()
    setData(d => ({
      ...d,
      deals: d.deals.map(deal => deal.id !== dealId ? deal : {
        ...deal,
        activities: [...(deal.activities || []), { id: genId(), date: now, ...activity }],
        last_update_date: now.slice(0, 10),
        updated_at: now,
      }),
    }))
  }

  function deleteDeal(id) {
    setData(d => ({
      ...d,
      deals: d.deals.filter(deal => deal.id !== id),
      tracks: d.tracks.filter(t => t.opportunity_id !== id),
      scores: Object.fromEntries(Object.entries(d.scores).filter(([k]) => k !== id)),
    }))
    if (selectedDealId === id) setSelectedDealId(null)
    setDeletingDealId(null)
  }

  function setDealStatus(id, status) {
    setData(d => ({
      ...d,
      deals: d.deals.map(deal => deal.id !== id ? deal : {
        ...deal, deal_status: status, updated_at: new Date().toISOString(),
      }),
    }))
  }

  function updateTrack(trackId, status) {
    setData(d => ({
      ...d,
      tracks: d.tracks.map(t => t.id !== trackId ? t : {
        ...t, status, updated_at: new Date().toISOString(),
      }),
    }))
  }

  function handleSort(field) {
    setSort(s => s.field === field
      ? { field, dir: s.dir === 'asc' ? 'desc' : 'asc' }
      : { field, dir: 'asc' }
    )
  }

  // ---- Lead Handlers ----

  function addLead(form) {
    const id = genId()
    const now = new Date().toISOString()
    const lead = {
      id,
      full_name: form.full_name || '',
      linkedin_url: form.linkedin_url || '',
      email: form.email || '',
      phone: form.phone || '',
      title: form.title || '',
      company: form.company || '',
      industry: form.industry || '',
      country: form.country || '',
      source: form.source || 'outbound',
      stage: form.stage || 'new',
      last_contact_date: form.last_contact_date || '',
      last_contact_note: form.last_contact_note || '',
      next_action: form.next_action || '',
      next_action_date: form.next_action_date || '',
      tags: form.tags || '',
      notes: form.notes || '',
      account_id: form.account_id || '',
      deal_id: null,
      created_at: now,
      updated_at: now,
    }
    setData(d => ({ ...d, leads: [...(d.leads || []), lead] }))
  }

  function updateLeadFn(id, form) {
    setData(d => ({
      ...d,
      leads: (d.leads || []).map(l => l.id !== id ? l : {
        ...l, ...form, updated_at: new Date().toISOString(),
      }),
    }))
  }

  function deleteLeadFn(id) {
    setData(d => ({ ...d, leads: (d.leads || []).filter(l => l.id !== id) }))
    if (selectedLeadId === id) setSelectedLeadId(null)
    setDeletingLeadId(null)
  }

  function updateLeadStage(id, stage) {
    setData(d => ({
      ...d,
      leads: (d.leads || []).map(l => l.id !== id ? l : {
        ...l, stage, updated_at: new Date().toISOString(),
      }),
    }))
  }

  function convertLeadToDeal(lead, dealForm) {
    const dealId = genId()
    const now = new Date().toISOString()
    const deal = {
      id: dealId,
      opportunity_name: dealForm.opportunity_name || `${lead.company || lead.full_name} - New Deal`,
      account_id: lead.account_id || '',
      account_name: dealForm.account_name || lead.company || lead.full_name,
      contact_name: lead.full_name || '',
      stage: dealForm.stage || 'prospecting',
      close_date: dealForm.close_date || '',
      new_arr: Number(dealForm.new_arr) || 0,
      added_arr: Number(dealForm.added_arr) || 0,
      type: dealForm.type || 'new_business',
      country: lead.country || '',
      deal_status: 'open',
      probability: calcProbFromStage(dealForm.stage || 'prospecting'),
      next_step: '',
      next_step_date: '',
      activities: [{ id: genId(), type: 'note', date: now, text: `Lead converted: ${lead.full_name}` }],
      last_meeting_date: '',
      last_update_note: `Converted from lead: ${lead.full_name}`,
      last_update_date: now.slice(0, 10),
      service_order_status: 'not_applicable',
      flowla_engagement: 'none',
      flowla_url: '',
      notes: lead.notes || '',
      created_at: now,
      updated_at: now,
    }
    setData(d => ({
      ...d,
      deals: [...d.deals, deal],
      tracks: [...d.tracks, ...createTrackRows(dealId)],
      scores: { ...d.scores, [dealId]: defaultScores() },
      leads: (d.leads || []).map(l => l.id !== lead.id ? l : {
        ...l, stage: 'converted', deal_id: dealId, updated_at: now,
      }),
    }))
    setConvertingLead(null)
    setSelectedLeadId(null)
  }

  function handleLeadSort(field) {
    setLeadSort(s => s.field === field
      ? { field, dir: s.dir === 'asc' ? 'desc' : 'asc' }
      : { field, dir: 'asc' }
    )
  }

  // ---- Computed ----

  const openDeals = data.deals.filter(d => d.deal_status === 'open')
  const wonDeals  = data.deals.filter(d => d.deal_status === 'closed_won')
  const lostDeals = data.deals.filter(d => d.deal_status === 'closed_lost')

  const filteredDeals = (() => {
    let arr = data.deals
    if (statusFilter === 'open') arr = openDeals
    else if (statusFilter === 'won') arr = wonDeals
    else if (statusFilter === 'lost') arr = lostDeals
    return [...arr].sort((a, b) => {
      let av = a[sort.field], bv = b[sort.field]
      if (sort.field === 'probability' || sort.field === 'new_arr' || sort.field === 'added_arr') {
        av = Number(av); bv = Number(bv)
      } else {
        av = String(av || '').toLowerCase(); bv = String(bv || '').toLowerCase()
      }
      if (av < bv) return sort.dir === 'asc' ? -1 : 1
      if (av > bv) return sort.dir === 'asc' ? 1 : -1
      return 0
    })
  })()

  const totalPipeline    = openDeals.reduce((s, d) => s + d.new_arr, 0)
  const weightedPipeline = openDeals.reduce((s, d) => s + d.new_arr * (d.probability / 100), 0)
  const closedWonTotal   = wonDeals.reduce((s, d) => s + d.new_arr, 0)

  const selectedDeal   = data.deals.find(d => d.id === selectedDealId) || null
  const deletingDeal   = data.deals.find(d => d.id === deletingDealId) || null

  // Lead computed
  const allLeads = data.leads || []
  const activeLeads = allLeads.filter(l => !['converted', 'not_interested'].includes(l.stage))
  const filteredLeads = (() => {
    let arr = allLeads
    if (leadStageFilter === 'active') arr = activeLeads
    else if (leadStageFilter !== 'all') arr = allLeads.filter(l => l.stage === leadStageFilter)
    return [...arr].sort((a, b) => {
      let av = a[leadSort.field], bv = b[leadSort.field]
      av = String(av || '').toLowerCase(); bv = String(bv || '').toLowerCase()
      if (av < bv) return leadSort.dir === 'asc' ? -1 : 1
      if (av > bv) return leadSort.dir === 'asc' ? 1 : -1
      return 0
    })
  })()
  const selectedLead = allLeads.find(l => l.id === selectedLeadId) || null
  const deletingLead = allLeads.find(l => l.id === deletingLeadId) || null

  return (
    <div style={{ fontFamily: 'system-ui, -apple-system, sans-serif', backgroundColor: '#f8fafc', minHeight: '100vh' }}>
      <Header activeTab={activeTab} setActiveTab={setActiveTab} />

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 16px 40px' }}>
        {activeTab === 'pipeline' && (
          <PipelineTab
            data={data}
            openDeals={openDeals} wonDeals={wonDeals} lostDeals={lostDeals}
            filteredDeals={filteredDeals}
            totalPipeline={totalPipeline} weightedPipeline={weightedPipeline} closedWonTotal={closedWonTotal}
            statusFilter={statusFilter} setStatusFilter={setStatusFilter}
            sort={sort} handleSort={handleSort}
            visibleCols={visibleCols} setVisibleCols={setVisibleCols}
            showColsDropdown={showColsDropdown} setShowColsDropdown={setShowColsDropdown}
            onNewDeal={() => setShowNewDeal(true)}
            onSelectDeal={setSelectedDealId}
            onShowQuota={() => setShowQuota(true)}
            onExport={() => exportToFile(data)}
          />
        )}
        {activeTab === 'home' && (
          <div style={{ maxWidth: 600 }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 24 }}>Settings & Integrations</h2>

            {/* Gmail Integration */}
            <div style={{ ...cardStyle, marginBottom: 16, padding: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>📧 Gmail</div>
                  {gmailConnected ? (
                    <div style={{ fontSize: 13, color: '#16a34a' }}>
                      Connected as <strong>{gmailEmail}</strong>
                    </div>
                  ) : (
                    <div style={{ fontSize: 13, color: '#94a3b8' }}>
                      Connect Gmail to auto-track email activity in your deals
                    </div>
                  )}
                </div>
                {gmailConnected ? (
                  <button onClick={disconnectGmail} style={{ ...btnSecondary, fontSize: 13, padding: '6px 14px', color: '#ef4444' }}>
                    Disconnect
                  </button>
                ) : (
                  <button onClick={connectGmail} style={{ ...btnPrimary, fontSize: 13, padding: '6px 14px' }}>
                    Connect Gmail
                  </button>
                )}
              </div>
            </div>

            {/* Grain Integration (placeholder for Phase 3) */}
            <div style={{ ...cardStyle, marginBottom: 16, padding: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>🎥 Grain</div>
                  <div style={{ fontSize: 13, color: '#94a3b8' }}>
                    Coming soon — connect Grain for call recordings & transcripts
                  </div>
                </div>
                <button disabled style={{ ...btnSecondary, fontSize: 13, padding: '6px 14px', opacity: 0.5 }}>
                  Coming Soon
                </button>
              </div>
            </div>

            {/* Data management */}
            <div style={{ ...cardStyle, padding: 20 }}>
              <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 12 }}>💾 Data</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => exportToFile(data)} style={{ ...btnSecondary, fontSize: 13, padding: '6px 14px' }}>
                  Export JSON
                </button>
                <label style={{ ...btnSecondary, fontSize: 13, padding: '6px 14px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}>
                  Import JSON
                  <input type="file" accept=".json" style={{ display: 'none' }} onChange={async (e) => {
                    if (e.target.files[0]) {
                      const imported = await importFromFile(e.target.files[0])
                      if (imported) setData(d => ({ ...DEFAULT_DATA, ...imported }))
                    }
                  }} />
                </label>
              </div>
            </div>
          </div>
        )}
        {activeTab === 'prospecting' && (
          <div>
            {/* Sub-tabs: Accounts / Leads */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: '#f1f5f9', borderRadius: 8, padding: 4, width: 'fit-content' }}>
              {(() => {
              const prospectingAccountCount = (data.accounts || []).filter(a => {
                const hasActiveDeals = data.deals.some(d => d.account_id === a.id && d.deal_status === 'open')
                return !hasActiveDeals && a.status !== 'customer'
              }).length
              return ['accounts', 'leads'].map(tab => (
                <button key={tab} onClick={() => setProspectingSubTab(tab)}
                  style={{
                    padding: '8px 20px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 600,
                    background: prospectingSubTab === tab ? '#fff' : 'transparent',
                    color: prospectingSubTab === tab ? '#6366f1' : '#64748b',
                    boxShadow: prospectingSubTab === tab ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                  }}>
                  {tab === 'accounts' ? `🏢 Accounts (${prospectingAccountCount})` : `👤 Leads (${activeLeads.length})`}
                </button>
              ))
            })()}
            </div>

            {prospectingSubTab === 'accounts' && (() => {
              // Only show accounts that are in prospecting phase (target/prospecting status, or no active deals)
              const prospectingAccounts = (data.accounts || []).filter(a => {
                const hasActiveDeals = data.deals.some(d => d.account_id === a.id && d.deal_status === 'open')
                return !hasActiveDeals && a.status !== 'customer'
              })
              return (
                <AccountsSection
                  accounts={prospectingAccounts}
                  deals={data.deals}
                  leads={data.leads || []}
                  leadsCount={activeLeads.length}
                  onNewAccount={() => setShowNewAccount(true)}
                  onSelectAccount={setSelectedAccountId}
                />
              )
            })()}

            {prospectingSubTab === 'leads' && (
              <LeadsTab
                leads={allLeads} activeLeads={activeLeads} filteredLeads={filteredLeads}
                stageFilter={leadStageFilter} setStageFilter={setLeadStageFilter}
                sort={leadSort} handleSort={handleLeadSort}
                onNewLead={() => setShowNewLead(true)}
                onSelectLead={setSelectedLeadId}
              />
            )}
          </div>
        )}
      </div>

      {showNewDeal && (
        <DealFormModal
          deal={newDealPrefill}
          accounts={data.accounts || []}
          onSave={(form) => { addDeal(form); setShowNewDeal(false); setNewDealPrefill(null) }}
          onClose={() => { setShowNewDeal(false); setNewDealPrefill(null) }}
        />
      )}
      {editDeal && (
        <DealFormModal
          deal={editDeal}
          accounts={data.accounts || []}
          onSave={(form) => { updateDeal(editDeal.id, form); setEditDeal(null) }}
          onClose={() => setEditDeal(null)}
        />
      )}
      {selectedDeal && (
        <DealDetailPanel
          deal={selectedDeal}
          gmailConnected={gmailConnected}
          onFetchEmails={fetchGmailEmails}
          tracks={data.tracks.filter(t => t.opportunity_id === selectedDeal.id)}
          onClose={() => setSelectedDealId(null)}
          onEdit={() => { setEditDeal(selectedDeal); setSelectedDealId(null) }}
          onDelete={() => { setDeletingDealId(selectedDeal.id); setSelectedDealId(null) }}
          onWon={() => setDealStatus(selectedDeal.id, 'closed_won')}
          onLost={() => setDealStatus(selectedDeal.id, 'closed_lost')}
          onReopen={() => setDealStatus(selectedDeal.id, 'open')}
          onUpdateTrack={updateTrack}
          onAddActivity={(activity) => addActivity(selectedDeal.id, activity)}
        />
      )}
      {deletingDeal && (
        <DeleteConfirmModal
          deal={deletingDeal}
          onConfirm={() => deleteDeal(deletingDeal.id)}
          onClose={() => setDeletingDealId(null)}
        />
      )}
      {showQuota && (
        <QuotaModal
          settings={data.settings}
          onSave={(s) => { setData(d => ({ ...d, settings: { ...d.settings, ...s } })); setShowQuota(false) }}
          onClose={() => setShowQuota(false)}
        />
      )}

      {/* Lead modals */}
      {showNewLead && (
        <LeadFormModal
          lead={newLeadPrefill}
          accounts={data.accounts || []}
          onSave={(form) => { addLead(form); setShowNewLead(false); setNewLeadPrefill(null) }}
          onClose={() => { setShowNewLead(false); setNewLeadPrefill(null) }}
        />
      )}
      {editLeadData && (
        <LeadFormModal
          lead={editLeadData}
          accounts={data.accounts || []}
          onSave={(form) => { updateLeadFn(editLeadData.id, form); setEditLeadData(null) }}
          onClose={() => setEditLeadData(null)}
        />
      )}
      {selectedLead && (
        <LeadDetailPanel
          lead={selectedLead}
          onClose={() => setSelectedLeadId(null)}
          onEdit={() => { setEditLeadData(selectedLead); setSelectedLeadId(null) }}
          onDelete={() => { setDeletingLeadId(selectedLead.id); setSelectedLeadId(null) }}
          onUpdateStage={(stage) => updateLeadStage(selectedLead.id, stage)}
          onConvert={() => { setConvertingLead(selectedLead); setSelectedLeadId(null) }}
        />
      )}
      {deletingLead && (
        <LeadDeleteModal
          lead={deletingLead}
          onConfirm={() => deleteLeadFn(deletingLead.id)}
          onClose={() => setDeletingLeadId(null)}
        />
      )}
      {convertingLead && (
        <ConvertLeadModal
          lead={convertingLead}
          onConvert={(dealForm) => convertLeadToDeal(convertingLead, dealForm)}
          onClose={() => setConvertingLead(null)}
        />
      )}
      {showNewAccount && (
        <AccountFormModal
          onSave={(form) => { addAccount(form); setShowNewAccount(false) }}
          onClose={() => setShowNewAccount(false)}
        />
      )}
      {editAccount && (
        <AccountFormModal
          account={editAccount}
          onSave={(form) => { updateAccount(editAccount.id, form); setEditAccount(null) }}
          onClose={() => setEditAccount(null)}
        />
      )}
      {selectedAccountId && (() => {
        const acct = (data.accounts || []).find(a => a.id === selectedAccountId)
        if (!acct) return null
        const acctDeals = data.deals.filter(d => d.account_id === acct.id)
        const acctLeads = (data.leads || []).filter(l => l.account_id === acct.id)
        return (
          <AccountDetailPanel
            account={acct}
            deals={acctDeals}
            leads={acctLeads}
            onClose={() => setSelectedAccountId(null)}
            onEdit={() => { setEditAccount(acct); setSelectedAccountId(null) }}
            onDelete={() => { deleteAccount(acct.id); setSelectedAccountId(null) }}
            onAddLead={() => {
              setNewLeadPrefill({ account_id: acct.id, company: acct.name, country: acct.country || '' })
              setShowNewLead(true)
              setSelectedAccountId(null)
            }}
            onSelectDeal={id => { setSelectedAccountId(null); setSelectedDealId(id) }}
            onSelectLead={id => { setSelectedAccountId(null); setSelectedLeadId(id) }}
            onConvertToOpportunity={() => {
              setNewDealPrefill({
                account_id: acct.id, account_name: acct.name,
                opportunity_name: `${acct.name} - New Deal`,
                country: acct.country || '', type: 'new_business',
              })
              setShowNewDeal(true)
              updateAccount(acct.id, { status: 'engaged' })
              setSelectedAccountId(null)
            }}
          />
        )
      })()}
    </div>
  )
}

// ---- Header ----

function Header({ activeTab, setActiveTab }) {
  const tabs = [
    { key: 'home', label: 'Home' },
    { key: 'pipeline', label: 'Pipeline Management' },
    { key: 'prospecting', label: 'Prospecting' },
  ]
  return (
    <div style={{ backgroundColor: '#fff', borderBottom: '1px solid #e2e8f0', marginBottom: 24 }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 16px', display: 'flex', alignItems: 'center' }}>
        <div style={{ fontWeight: 700, fontSize: 18, color: '#6366f1', marginRight: 32, padding: '14px 0', whiteSpace: 'nowrap' }}>
          Storyly Pipeline
        </div>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            padding: '14px 16px', fontWeight: activeTab === t.key ? 600 : 400,
            color: activeTab === t.key ? '#6366f1' : '#64748b',
            borderBottom: activeTab === t.key ? '2px solid #6366f1' : '2px solid transparent',
            fontSize: 14, whiteSpace: 'nowrap',
          }}>
            {t.label}
          </button>
        ))}
      </div>
    </div>
  )
}

// ---- Placeholder tabs ----

function PlaceholderTab({ label, desc }) {
  return (
    <div style={{ textAlign: 'center', padding: '80px 0', color: '#94a3b8' }}>
      <div style={{ fontSize: 22, fontWeight: 600, marginBottom: 8, color: '#64748b' }}>{label}</div>
      <div style={{ fontSize: 14 }}>{desc}</div>
    </div>
  )
}

// ---- Pipeline Tab ----

function PipelineTab({ data, openDeals, wonDeals, lostDeals, filteredDeals, totalPipeline, weightedPipeline, closedWonTotal, statusFilter, setStatusFilter, sort, handleSort, visibleCols, setVisibleCols, showColsDropdown, setShowColsDropdown, onNewDeal, onSelectDeal, onShowQuota, onExport }) {
  const { settings } = data
  const quotaPct = settings.quota_target > 0 ? (closedWonTotal / settings.quota_target) * 100 : 0
  const quotaGap = settings.quota_target > 0 ? Math.max(0, settings.quota_target - closedWonTotal) : 0

  return (
    <div>
      {/* Metrics bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 24 }}>
        <MetricCard
          title="Total Pipeline"
          value={fmtMoney(Math.round(totalPipeline))}
          sub={`${openDeals.length} active deal${openDeals.length !== 1 ? 's' : ''}`}
        />
        <MetricCard
          title="Weighted Pipeline"
          value={fmtMoney(Math.round(weightedPipeline))}
          sub="Expected new ARR"
        />
        <MetricCard
          title="Closed Won"
          value={fmtMoney(Math.round(closedWonTotal))}
          sub={`${wonDeals.length} deal${wonDeals.length !== 1 ? 's' : ''} closed`}
        />
        <MetricCard
          title={settings.quota_quarter || 'Quota'}
          value={settings.quota_target > 0 ? `${Math.round(quotaPct)}%` : 'Click to set target'}
          sub={settings.quota_target > 0 ? `Gap: ${fmtMoney(Math.round(quotaGap))}` : ''}
          progress={settings.quota_target > 0 ? Math.min(100, quotaPct) : null}
          onClick={onShowQuota}
          clickable
        />
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
        <StatusFilter
          statusFilter={statusFilter} setStatusFilter={setStatusFilter}
          counts={{ all: data.deals.length, open: openDeals.length, won: wonDeals.length, lost: lostDeals.length }}
        />
        <div style={{ display: 'flex', gap: 8 }}>
          <ColumnsDropdown visibleCols={visibleCols} setVisibleCols={setVisibleCols} open={showColsDropdown} setOpen={setShowColsDropdown} />
          <button onClick={onExport} style={btnSecondary}>Export JSON</button>
          <button onClick={onNewDeal} style={btnPrimary}>+ New Deal</button>
        </div>
      </div>

      {/* Table */}
      <PipelineTable deals={filteredDeals} tracks={data.tracks} sort={sort} handleSort={handleSort} visibleCols={visibleCols} onSelectDeal={onSelectDeal} />
    </div>
  )
}

// ---- Metric Card ----

function MetricCard({ title, value, sub, progress, onClick, clickable }) {
  return (
    <div
      onClick={onClick}
      style={{
        ...cardStyle,
        cursor: clickable ? 'pointer' : 'default',
        transition: 'box-shadow 0.15s',
      }}
      onMouseEnter={e => { if (clickable) e.currentTarget.style.boxShadow = '0 0 0 2px #6366f1' }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none' }}
    >
      <div style={{ fontSize: 12, color: '#64748b', fontWeight: 500, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>{title}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: '#94a3b8' }}>{sub}</div>}
      {progress !== null && progress !== undefined && (
        <div style={{ marginTop: 8, height: 4, background: '#e2e8f0', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${progress}%`, background: progress >= 100 ? '#22c55e' : '#6366f1', borderRadius: 2, transition: 'width 0.3s' }} />
        </div>
      )}
    </div>
  )
}

// ---- Status Filter ----

function StatusFilter({ statusFilter, setStatusFilter, counts }) {
  const opts = [
    { key: 'all',  label: 'All',  count: counts.all },
    { key: 'open', label: 'Open', count: counts.open },
    { key: 'won',  label: 'Won',  count: counts.won },
    { key: 'lost', label: 'Lost', count: counts.lost },
  ]
  return (
    <div style={{ display: 'flex', background: '#e2e8f0', borderRadius: 8, padding: 3, gap: 2 }}>
      {opts.map(o => (
        <button key={o.key} onClick={() => setStatusFilter(o.key)} style={{
          background: statusFilter === o.key ? '#fff' : 'transparent',
          border: 'none', cursor: 'pointer', borderRadius: 6,
          padding: '6px 14px', fontSize: 13, fontWeight: statusFilter === o.key ? 600 : 400,
          color: statusFilter === o.key ? '#0f172a' : '#64748b',
          boxShadow: statusFilter === o.key ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
          transition: 'all 0.15s',
        }}>
          {o.label} <span style={{ fontSize: 11, color: statusFilter === o.key ? '#6366f1' : '#94a3b8' }}>({o.count})</span>
        </button>
      ))}
    </div>
  )
}

// ---- Columns Dropdown ----

function ColumnsDropdown({ visibleCols, setVisibleCols, open, setOpen }) {
  const ref = useRef(null)
  useEffect(() => {
    function handleClick(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [setOpen])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setOpen(o => !o)} style={btnSecondary}>
        Columns ▾
      </button>
      {open && (
        <div style={{
          position: 'absolute', right: 0, top: '110%', background: '#fff',
          border: '1px solid #e2e8f0', borderRadius: 8, padding: 8, minWidth: 180,
          boxShadow: '0 4px 16px rgba(0,0,0,0.1)', zIndex: 200,
        }}>
          {COLUMNS_CONFIG.map(col => (
            <label key={col.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', cursor: 'pointer', fontSize: 13, color: '#374151', borderRadius: 4 }}>
              <input
                type="checkbox"
                checked={visibleCols[col.key] !== false}
                onChange={e => setVisibleCols(v => ({ ...v, [col.key]: e.target.checked }))}
                style={{ accentColor: '#6366f1' }}
              />
              {col.label}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

// ---- Pipeline Table ----

function PipelineTable({ deals, tracks, sort, handleSort, visibleCols, onSelectDeal }) {
  const visibleColumns = COLUMNS_CONFIG.filter(c => visibleCols[c.key] !== false)

  if (deals.length === 0) {
    return (
      <div style={{ ...cardStyle, textAlign: 'center', padding: 48, color: '#94a3b8' }}>
        No deals match the current filter. Click + New Deal to add an opportunity.
      </div>
    )
  }

  function SortIcon({ field }) {
    if (sort.field !== field) return <span style={{ color: '#cbd5e1', marginLeft: 4 }}>↕</span>
    return <span style={{ color: '#6366f1', marginLeft: 4 }}>{sort.dir === 'asc' ? '↑' : '↓'}</span>
  }

  const thStyle = (field) => ({
    padding: '10px 14px', textAlign: 'left', fontSize: 12, fontWeight: 600,
    color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5,
    cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap',
    background: '#f8fafc',
  })

  const tdStyle = { padding: '12px 14px', fontSize: 13, color: '#374151', verticalAlign: 'middle' }

  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
            {visibleColumns.map(col => (
              <th key={col.key} style={thStyle(col.key)} onClick={() => handleSort(col.key)}>
                {col.label}<SortIcon field={col.key} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {deals.map((deal, i) => {
            const dealTracks = tracks.filter(t => t.opportunity_id === deal.id)
            const si = statusInfo(deal.deal_status)
            return (
              <tr
                key={deal.id}
                onClick={() => onSelectDeal(deal.id)}
                style={{
                  borderBottom: i < deals.length - 1 ? '1px solid #f1f5f9' : 'none',
                  cursor: 'pointer',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                {visibleColumns.map(col => {
                  const fc = forecastCat(deal.probability || 0)
                  const stageObj = DEAL_STAGES.find(s => s.key === deal.stage)
                  return (
                  <td key={col.key} style={tdStyle}>
                    {col.key === 'opportunity_name' && <span style={{ fontWeight: 600, color: '#6366f1' }}>{deal.opportunity_name || deal.account_name}</span>}
                    {col.key === 'account_name' && <span>{deal.account_name}</span>}
                    {col.key === 'stage' && (
                      <span style={{ background: '#f1f5f9', color: '#475569', borderRadius: 4, padding: '2px 8px', fontSize: 12, fontWeight: 500 }}>
                        {stageObj ? stageObj.label : deal.stage || '—'}
                      </span>
                    )}
                    {col.key === 'close_date' && (deal.close_date ? fmtDate(deal.close_date) : '—')}
                    {col.key === 'new_arr' && fmtMoney(deal.new_arr)}
                    {col.key === 'forecast' && (
                      <span style={{ color: fc.color, fontWeight: 600, fontSize: 12 }}>{fc.label}</span>
                    )}
                    {col.key === 'added_arr' && fmtMoney(deal.added_arr || 0)}
                    {col.key === 'health' && (() => {
                      const h = dealHealth(deal)
                      return <span style={{ background: h.bg, color: h.color, borderRadius: 4, padding: '2px 8px', fontSize: 12, fontWeight: 600 }}>
                        {h.icon} {h.label}
                      </span>
                    })()}
                    {col.key === 'type' && (
                      <span style={{
                        background: deal.type === 'new_business' ? '#eff6ff' : '#fffbeb',
                        color: deal.type === 'new_business' ? '#2563eb' : '#d97706',
                        borderRadius: 4, padding: '2px 8px', fontSize: 12, fontWeight: 500,
                      }}>
                        {deal.type === 'new_business' ? 'New' : 'Upsell'}
                      </span>
                    )}
                    {col.key === 'country' && (deal.country || '—')}
                    {col.key === 'probability' && (
                      <span style={{ color: probColor(deal.probability), fontWeight: 600 }}>
                        {deal.probability}%
                      </span>
                    )}
                    {col.key === 'status' && (
                      <span style={{ background: si.bg, color: si.color, borderRadius: 4, padding: '2px 8px', fontSize: 12, fontWeight: 500 }}>
                        {si.label}
                      </span>
                    )}
                    {col.key === 'tracks' && <TrackDots tracks={dealTracks} />}
                    {col.key === 'flowla' && (
                      <span style={{
                        color: deal.flowla_engagement === 'high' ? '#16a34a' : deal.flowla_engagement === 'low' ? '#ca8a04' : '#94a3b8',
                        fontWeight: deal.flowla_engagement !== 'none' ? 600 : 400,
                        fontSize: 12,
                      }}>
                        {FLOWLA_LABELS[deal.flowla_engagement] || '—'}
                      </span>
                    )}
                    {col.key === 'last_update' && (
                      <span style={{ color: deal.last_update_date && daysAgo(deal.last_update_date) > 7 ? '#f59e0b' : '#374151' }}>
                        {deal.last_update_date ? fmtDate(deal.last_update_date) : '—'}
                      </span>
                    )}
                    {col.key === 'service_order' && (SERVICE_ORDER_LABELS[deal.service_order_status] || '—')}
                    {col.key === 'contact' && (deal.contact_name || '—')}
                    {col.key === 'created' && fmtDate(deal.created_at)}
                  </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function TrackDots({ tracks }) {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {TRACKS_CONFIG.map(tc => {
        const t = tracks.find(x => x.track_name === tc.key)
        const st = TRACK_STATUSES.find(s => s.key === (t ? t.status : 'not_started'))
        return (
          <div
            key={tc.key}
            title={`${tc.label}: ${st ? st.label : 'Not Started'}`}
            style={{ width: 10, height: 10, borderRadius: 2, background: st ? st.color : '#94a3b8' }}
          />
        )
      })}
    </div>
  )
}

// ---- Deal Form Modal ----

function DealFormModal({ deal, accounts = [], onSave, onClose }) {
  const [form, setForm] = useState({
    opportunity_name: deal?.opportunity_name || '',
    account_id: deal?.account_id || '',
    account_name: deal?.account_name || '',
    contact_name: deal?.contact_name || '',
    stage: deal?.stage || 'prospecting',
    close_date: deal?.close_date || '',
    new_arr: deal?.new_arr || '',
    added_arr: deal?.added_arr || '',
    type: deal?.type || 'new_business',
    country: deal?.country || '',
    deal_status: deal?.deal_status || 'open',
    last_meeting_date: deal?.last_meeting_date || '',
    last_update_date: deal?.last_update_date || '',
    last_update_note: deal?.last_update_note || '',
    service_order_status: deal?.service_order_status || 'not_applicable',
    flowla_engagement: deal?.flowla_engagement || 'none',
    flowla_url: deal?.flowla_url || '',
    next_step: deal?.next_step || '',
    next_step_date: deal?.next_step_date || '',
    notes: deal?.notes || '',
  })

  function set(key, val) { setForm(f => ({ ...f, [key]: val })) }

  function handleSubmit(e) {
    e.preventDefault()
    if (!form.opportunity_name.trim() && !form.account_name.trim()) return
    onSave(form)
  }

  const field = (label, content, fullWidth = false) => (
    <div style={{ gridColumn: fullWidth ? '1 / -1' : undefined }}>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#64748b', marginBottom: 4 }}>{label}</label>
      {content}
    </div>
  )

  const inp = (key, type = 'text', placeholder = '') => (
    <input
      type={type} value={form[key]} placeholder={placeholder}
      onChange={e => set(key, e.target.value)}
      style={{ width: '100%', padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13 }}
    />
  )

  const sel = (key, options) => (
    <select value={form[key]} onChange={e => set(key, e.target.value)}
      style={{ width: '100%', padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, background: '#fff' }}>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )

  return (
    <div style={overlayStyle} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 640, maxHeight: '90vh', overflow: 'auto' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{deal?.id ? 'Edit Deal' : 'New Deal'}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#94a3b8' }}>✕</button>
        </div>
        <form onSubmit={handleSubmit} style={{ padding: 24 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {field('Opportunity Name *', inp('opportunity_name', 'text', 'e.g. BEES (Brasil) - Renewal 2026/27'), true)}
            {field('Account', accounts.length > 0 ? (
              <select value={form.account_id} onChange={e => {
                const acct = accounts.find(a => a.id === e.target.value)
                set('account_id', e.target.value)
                if (acct) set('account_name', acct.name)
              }}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, background: '#fff' }}>
                <option value="">— Select or type below —</option>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            ) : inp('account_name', 'text', 'e.g. BEES (Brasil)'))}
            {form.account_id ? null : field('Account Name', inp('account_name', 'text', 'e.g. BEES (Brasil)'))}
            {field('Contact Name', inp('contact_name'))}
            {field('Stage', sel('stage', DEAL_STAGES.map(s => ({ value: s.key, label: s.label }))))}
            {field('Close Date', inp('close_date', 'date'))}
            {field('Annual Deal Size (USD)', inp('new_arr', 'number'))}
            {field('Added ARR (USD)', inp('added_arr', 'number'))}
            {field('Type', sel('type', [{ value: 'new_business', label: 'New Business' }, { value: 'upsell', label: 'Upsell' }]))}
            {field('Country', (
              <select value={form.country} onChange={e => set('country', e.target.value)}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, background: '#fff' }}>
                <option value="">— Select —</option>
                {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            ))}
            {field('Deal Status', sel('deal_status', [{ value: 'open', label: 'Open' }, { value: 'closed_won', label: 'Closed Won' }, { value: 'closed_lost', label: 'Closed Lost' }]))}
            {field('Last Meeting', inp('last_meeting_date', 'date'))}
            {field('Last Update Date', inp('last_update_date', 'date'))}
            {field('Last Update / Message', (
              <input value={form.last_update_note} onChange={e => set('last_update_note', e.target.value)}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13 }} />
            ), true)}
            {field('Service Order', sel('service_order_status', SERVICE_ORDER_OPTIONS.map(o => ({ value: SERVICE_ORDER_KEYS[o], label: o }))))}
            {field('Flowla Engagement', sel('flowla_engagement', FLOWLA_OPTIONS.map(o => ({ value: FLOWLA_KEYS[o], label: o }))))}
            {field('Flowla URL', inp('flowla_url', 'text', 'https://'), true)}
            {field('Next Step', inp('next_step', 'text', 'e.g. Send proposal, Schedule tech call...'))}
            {field('Next Step Date', inp('next_step_date', 'date'))}
            {field('Notes', (
              <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={3}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, resize: 'vertical' }} />
            ), true)}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 24 }}>
            <button type="button" onClick={onClose} style={btnSecondary}>Cancel</button>
            <button type="submit" style={btnPrimary}>{deal?.id ? 'Save Changes' : 'Add Deal'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ---- Deal Detail Panel ----

function DealDetailPanel({ deal, tracks, onClose, onEdit, onDelete, onWon, onLost, onReopen, onUpdateTrack, onAddActivity, gmailConnected, onFetchEmails }) {
  const prob = deal.probability || 0
  const fc = forecastCat(prob)
  const si = statusInfo(deal.deal_status)
  const health = dealHealth(deal)
  const daysInPipe = daysAgo(deal.created_at)
  const [newActivity, setNewActivity] = useState({ type: 'note', text: '' })
  const [gmailEmails, setGmailEmails] = useState([])
  const [loadingEmails, setLoadingEmails] = useState(false)

  async function handleFetchEmails() {
    // Try to find a contact email from the deal or associated contacts
    const contactEmail = deal.contact_email || deal.email || ''
    if (!contactEmail && !deal.account_name) return
    setLoadingEmails(true)
    try {
      const emails = await onFetchEmails(contactEmail || deal.account_name)
      setGmailEmails(emails)
    } catch { }
    setLoadingEmails(false)
  }

  function handleAddActivity(e) {
    e.preventDefault()
    if (!newActivity.text.trim()) return
    onAddActivity(newActivity)
    setNewActivity({ type: 'note', text: '' })
  }

  const activities = [...(deal.activities || [])].sort((a, b) => new Date(b.date) - new Date(a.date))
  const actIcons = { note: '📝', email_sent: '📤', email_received: '📥', call: '📞', meeting: '🤝', whatsapp: '💬', grain: '🎥' }
  const actLabels = { note: 'Note', email_sent: 'Email Sent', email_received: 'Email Received', call: 'Call', meeting: 'Meeting', whatsapp: 'WhatsApp', grain: 'Grain Recording' }

  return (
    <div style={overlayStyle} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 640, maxHeight: '90vh', overflow: 'auto' }}>
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4, flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 700, fontSize: 18 }}>{deal.opportunity_name || deal.account_name}</span>
                <span style={{ background: si.bg, color: si.color, borderRadius: 4, padding: '2px 8px', fontSize: 12, fontWeight: 600 }}>{si.label}</span>
                <span style={{ background: health.bg, color: health.color, borderRadius: 4, padding: '2px 8px', fontSize: 12, fontWeight: 600 }}>
                  {health.icon} {health.label}
                </span>
              </div>
              <div style={{ fontSize: 13, color: '#64748b' }}>
                {deal.account_name && <span>{deal.account_name}</span>}
                {deal.account_name && deal.contact_name && <span> · </span>}
                {deal.contact_name && <span>{deal.contact_name}</span>}
                {(deal.account_name || deal.contact_name) && deal.country && <span> · </span>}
                {deal.country && <span>{deal.country}</span>}
              </div>
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#94a3b8', flexShrink: 0 }}>✕</button>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
            {deal.deal_status === 'open' ? (
              <>
                <button onClick={onWon}  style={{ ...btnPrimary, background: '#22c55e', fontSize: 13, padding: '6px 14px' }}>Won</button>
                <button onClick={onLost} style={{ ...btnPrimary, background: '#ef4444', fontSize: 13, padding: '6px 14px' }}>Lost</button>
              </>
            ) : (
              <button onClick={onReopen} style={{ ...btnSecondary, fontSize: 13, padding: '6px 14px' }}>Reopen</button>
            )}
            <button onClick={onEdit}   style={{ ...btnSecondary, fontSize: 13, padding: '6px 14px' }}>Edit</button>
            <button onClick={onDelete} style={{ ...btnSecondary, fontSize: 13, padding: '6px 14px', color: '#ef4444' }}>Delete</button>
          </div>
        </div>

        <div style={{ padding: 24 }}>
          {/* Health + Next Step banner */}
          {deal.next_step && (
            <div style={{
              background: health.bg, border: `1px solid ${health.color}33`, borderRadius: 8, padding: 12, marginBottom: 16,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: health.color, marginBottom: 2 }}>NEXT STEP</div>
                <div style={{ fontSize: 13, fontWeight: 500, color: '#0f172a' }}>{deal.next_step}</div>
              </div>
              {deal.next_step_date && (
                <div style={{ fontSize: 12, color: health.color, fontWeight: 600, textAlign: 'right' }}>
                  {fmtDate(deal.next_step_date)}
                  {new Date(deal.next_step_date) < new Date() && <div style={{ fontSize: 11, color: '#ef4444' }}>OVERDUE</div>}
                </div>
              )}
            </div>
          )}

          {/* Stage & Close Date */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
            <MiniCard label="Stage" value={
              <span style={{ color: '#475569', fontWeight: 600, fontSize: 12 }}>
                {(DEAL_STAGES.find(s => s.key === deal.stage) || {}).label || deal.stage || '—'}
              </span>
            } />
            <MiniCard label="Close Date" value={deal.close_date ? fmtDate(deal.close_date) : '—'} />
            <MiniCard label="Probability" value={<span style={{ color: probColor(prob), fontWeight: 700 }}>{prob}%</span>} />
          </div>

          {/* Metrics */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 20 }}>
            <MiniCard label="Deal Size" value={fmtMoney(deal.new_arr)} />
            <MiniCard label="Added ARR" value={fmtMoney(deal.added_arr || 0)} />
            <MiniCard label="Forecast" value={<span style={{ color: fc.color, fontWeight: 600 }}>{fc.label}</span>} />
            <MiniCard label="In Pipeline" value={daysInPipe != null ? `${daysInPipe}d` : '—'} />
          </div>

          {/* Activity Timeline */}
          <SectionLabel>Activity Timeline</SectionLabel>
          <form onSubmit={handleAddActivity} style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <select value={newActivity.type} onChange={e => setNewActivity(a => ({ ...a, type: e.target.value }))}
              style={{ padding: '6px 8px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 12, background: '#fff', minWidth: 100 }}>
              <option value="note">📝 Note</option>
              <option value="email_sent">📤 Email Sent</option>
              <option value="email_received">📥 Email Received</option>
              <option value="call">📞 Call</option>
              <option value="meeting">🤝 Meeting</option>
              <option value="whatsapp">💬 WhatsApp</option>
            </select>
            <input
              value={newActivity.text} onChange={e => setNewActivity(a => ({ ...a, text: e.target.value }))}
              placeholder="What happened?"
              style={{ flex: 1, padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13 }}
            />
            <button type="submit" style={{ ...btnPrimary, padding: '6px 14px', fontSize: 13 }}>Add</button>
          </form>

          {activities.length > 0 ? (
            <div style={{ maxHeight: 250, overflowY: 'auto', borderRadius: 8, border: '1px solid #e2e8f0' }}>
              {activities.map((act, i) => (
                <div key={act.id || i} style={{
                  padding: '10px 14px', borderBottom: i < activities.length - 1 ? '1px solid #f1f5f9' : 'none',
                  display: 'flex', gap: 10, alignItems: 'flex-start',
                }}>
                  <span style={{ fontSize: 16, flexShrink: 0 }}>{actIcons[act.type] || '📝'}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, color: '#0f172a' }}>{act.text}</div>
                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                      {actLabels[act.type] || act.type} · {fmtDate(act.date)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ ...cardStyle, padding: 16, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
              No activities yet. Add notes, log emails, or connect Gmail & Grain for auto-tracking.
            </div>
          )}

          {/* Gmail Emails */}
          {gmailConnected && (
            <div style={{ marginTop: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <SectionLabel>📧 Gmail History</SectionLabel>
                <button onClick={handleFetchEmails} disabled={loadingEmails}
                  style={{ ...btnSecondary, fontSize: 11, padding: '4px 10px' }}>
                  {loadingEmails ? 'Loading...' : gmailEmails.length > 0 ? 'Refresh' : 'Fetch Emails'}
                </button>
              </div>
              {gmailEmails.length > 0 ? (
                <div style={{ maxHeight: 200, overflowY: 'auto', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                  {gmailEmails.map((email, i) => {
                    const isSent = email.labelIds?.includes('SENT')
                    return (
                      <div key={email.id} style={{
                        padding: '8px 12px', borderBottom: i < gmailEmails.length - 1 ? '1px solid #f1f5f9' : 'none',
                        display: 'flex', gap: 8, alignItems: 'flex-start',
                      }}>
                        <span style={{ fontSize: 14, flexShrink: 0 }}>{isSent ? '📤' : '📥'}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {email.subject || '(no subject)'}
                          </div>
                          <div style={{ fontSize: 11, color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {isSent ? `To: ${email.to}` : `From: ${email.from}`} · {email.date ? new Date(email.date).toLocaleDateString() : ''}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : !loadingEmails ? (
                <div style={{ ...cardStyle, padding: 12, textAlign: 'center', color: '#94a3b8', fontSize: 12 }}>
                  Click "Fetch Emails" to load email history for this deal
                </div>
              ) : null}
            </div>
          )}

          {/* Process Tracks */}
          <div style={{ marginTop: 20 }}>
            <SectionLabel>Process Tracks</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
              {TRACKS_CONFIG.map(tc => {
                const t = tracks.find(x => x.track_name === tc.key)
                return <TrackRow key={tc.key} trackConfig={tc} track={t} onUpdateTrack={onUpdateTrack} />
              })}
            </div>
          </div>

          {/* Status fields */}
          <SectionLabel>Status</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 20 }}>
            <MiniCard label="Service Order" value={SERVICE_ORDER_LABELS[deal.service_order_status] || '—'} />
            <MiniCard label="Flowla" value={
              <span>
                {FLOWLA_LABELS[deal.flowla_engagement] || '—'}
                {deal.flowla_url && (
                  <a href={deal.flowla_url} target="_blank" rel="noreferrer" style={{ marginLeft: 6, fontSize: 11, color: '#6366f1' }} onClick={e => e.stopPropagation()}>↗ Open</a>
                )}
              </span>
            } />
            <MiniCard label="Type" value={deal.type === 'new_business' ? 'New Biz' : 'Upsell'} />
          </div>

          {/* Notes */}
          {deal.notes && (
            <>
              <SectionLabel>Notes</SectionLabel>
              <div style={{ ...cardStyle, padding: 12, fontSize: 13, color: '#374151', whiteSpace: 'pre-wrap', background: '#f8fafc' }}>
                {deal.notes}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function SectionLabel({ children }) {
  return <div style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>{children}</div>
}

function MiniCard({ label, value, onClick, clickable }) {
  return (
    <div
      onClick={onClick}
      style={{
        ...cardStyle, padding: 12, cursor: clickable ? 'pointer' : 'default',
      }}
      onMouseEnter={e => { if (clickable) e.currentTarget.style.boxShadow = '0 0 0 2px #6366f1' }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none' }}
    >
      <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>{value}</div>
    </div>
  )
}

function TrackRow({ trackConfig, track, onUpdateTrack }) {
  const currentStatus = track ? track.status : 'not_started'
  return (
    <div style={{ ...cardStyle, padding: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: trackConfig.color, marginBottom: 8 }}>{trackConfig.label}</div>
      <div style={{ display: 'flex', gap: 4 }}>
        {TRACK_STATUSES.map((s, i) => {
          const isActive = currentStatus === s.key
          return (
            <button
              key={s.key}
              onClick={() => track && onUpdateTrack(track.id, s.key)}
              title={s.label}
              style={{
                flex: 1, height: 28, border: isActive ? `2px solid ${s.color}` : '2px solid #e2e8f0',
                background: isActive ? s.color : '#f8fafc',
                borderRadius: 4, cursor: 'pointer', transition: 'all 0.15s',
                fontSize: 10, fontWeight: 600, color: isActive ? '#fff' : '#94a3b8',
              }}
            >
              {s.label.split(' ')[0]}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// (ProbabilityScorerModal removed — probability now auto-calculated from stage)

// ---- Delete Confirm Modal ----

function DeleteConfirmModal({ deal, onConfirm, onClose }) {
  return (
    <div style={overlayStyle}>
      <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 400, padding: 28 }}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 12 }}>Delete Deal</div>
        <div style={{ fontSize: 14, color: '#374151', marginBottom: 24 }}>
          Are you sure you want to delete <strong>{deal.account_name}</strong>? This cannot be undone.
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} style={btnSecondary}>Cancel</button>
          <button onClick={onConfirm} style={btnDanger}>Delete</button>
        </div>
      </div>
    </div>
  )
}

// ---- Quota Modal ----

function QuotaModal({ settings, onSave, onClose }) {
  const [form, setForm] = useState({
    quota_quarter: settings.quota_quarter || 'Q2 2026',
    quota_target: settings.quota_target || '',
  })

  function handleSubmit(e) {
    e.preventDefault()
    onSave({ quota_quarter: form.quota_quarter, quota_target: Number(form.quota_target) || 0 })
  }

  return (
    <div style={overlayStyle}>
      <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 380, padding: 28 }}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 20 }}>Quota Settings</div>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#64748b', marginBottom: 4 }}>Quarter</label>
            <input
              value={form.quota_quarter}
              onChange={e => setForm(f => ({ ...f, quota_quarter: e.target.value }))}
              placeholder="e.g. Q2 2026"
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13 }}
            />
          </div>
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#64748b', marginBottom: 4 }}>Quota Target (USD)</label>
            <input
              type="number" value={form.quota_target}
              onChange={e => setForm(f => ({ ...f, quota_target: e.target.value }))}
              placeholder="e.g. 500000"
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13 }}
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button type="button" onClick={onClose} style={btnSecondary}>Cancel</button>
            <button type="submit" style={btnPrimary}>Save</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ===================================================
// ============== LEADS COMPONENTS ===================
// ===================================================

// ---- Accounts Section ----

function AccountsSection({ accounts, deals, leads, leadsCount = 0, onNewAccount, onSelectAccount }) {
  const [search, setSearch] = useState('')

  const filtered = accounts.filter(a =>
    !search || a.name.toLowerCase().includes(search.toLowerCase()) ||
    (a.industry || '').toLowerCase().includes(search.toLowerCase()) ||
    (a.country || '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div>
      {/* Header bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search accounts..."
          style={{ padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, width: 260 }}
        />
        <button onClick={onNewAccount} style={btnPrimary}>+ Add Account</button>
      </div>

      {/* Account cards grid */}
      {filtered.length > 0 ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
          {filtered.map(account => {
            const acctDeals = deals.filter(d => d.account_id === account.id)
            const acctLeads = leads.filter(l => l.account_id === account.id)
            const openDeals = acctDeals.filter(d => d.deal_status === 'open')
            const totalArr = openDeals.reduce((s, d) => s + (d.new_arr || 0), 0)
            const si = accountStatusInfo(account.status)

            return (
              <div key={account.id} onClick={() => onSelectAccount(account.id)} style={{
                ...cardStyle, cursor: 'pointer', transition: 'all 0.15s',
                borderLeft: `3px solid ${si.color}`,
              }}
                onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)' }}
                onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, color: '#0f172a' }}>{account.name}</div>
                  <span style={{ background: si.bg, color: si.color, borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 600, flexShrink: 0 }}>
                    {si.label}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: '#64748b', marginBottom: 10 }}>
                  {[account.industry, account.country].filter(Boolean).join(' · ') || '—'}
                </div>
                <div style={{ display: 'flex', gap: 16, fontSize: 12 }}>
                  <span style={{ color: '#6366f1', fontWeight: 600 }}>
                    {openDeals.length} deal{openDeals.length !== 1 ? 's' : ''}
                  </span>
                  <span style={{ color: '#3b82f6', fontWeight: 600 }}>
                    {acctLeads.length} lead{acctLeads.length !== 1 ? 's' : ''}
                  </span>
                  {totalArr > 0 && (
                    <span style={{ color: '#22c55e', fontWeight: 600 }}>
                      {fmtMoney(totalArr)}
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div style={{ ...cardStyle, padding: 32, textAlign: 'center', color: '#94a3b8' }}>
          {search ? 'No accounts match your search.' : (
            <>
              No accounts yet. Click "+ Add Account" to start prospecting.
              {leadsCount > 0 && (
                <div style={{ marginTop: 8, fontSize: 12 }}>You have {leadsCount} lead{leadsCount !== 1 ? 's' : ''} in the Leads tab.</div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ---- Account Form Modal ----

function AccountFormModal({ account, onSave, onClose }) {
  const [form, setForm] = useState({
    name: account?.name || '',
    industry: account?.industry || '',
    country: account?.country || '',
    website: account?.website || '',
    company_size: account?.company_size || '',
    status: account?.status || 'target',
    notes: account?.notes || '',
  })

  function set(key, val) { setForm(f => ({ ...f, [key]: val })) }

  function handleSubmit(e) {
    e.preventDefault()
    if (!form.name.trim()) return
    onSave(form)
  }

  const field = (label, content, fullWidth = false) => (
    <div style={{ gridColumn: fullWidth ? '1 / -1' : undefined }}>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#64748b', marginBottom: 4 }}>{label}</label>
      {content}
    </div>
  )

  const inp = (key, type = 'text', placeholder = '') => (
    <input type={type} value={form[key]} placeholder={placeholder}
      onChange={e => set(key, e.target.value)}
      style={{ width: '100%', padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13 }} />
  )

  return (
    <div style={overlayStyle} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 540, maxHeight: '90vh', overflow: 'auto' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{account ? 'Edit Account' : 'New Account'}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#94a3b8' }}>✕</button>
        </div>
        <form onSubmit={handleSubmit} style={{ padding: 24 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {field('Company Name *', inp('name', 'text', 'e.g. BEES, Banco BMG...'), true)}
            {field('Industry', (
              <select value={form.industry} onChange={e => set('industry', e.target.value)}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, background: '#fff' }}>
                <option value="">— Select —</option>
                {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
              </select>
            ))}
            {field('Country', (
              <select value={form.country} onChange={e => set('country', e.target.value)}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, background: '#fff' }}>
                <option value="">— Select —</option>
                {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            ))}
            {field('Website', inp('website', 'text', 'https://'))}
            {field('Company Size', inp('company_size', 'text', 'e.g. 200, 2700...'))}
            {field('Status', (
              <select value={form.status} onChange={e => set('status', e.target.value)}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, background: '#fff' }}>
                {ACCOUNT_STATUSES.map(s => <option key={s.key} value={s.key}>{s.label} — {s.desc}</option>)}
              </select>
            ))}
            {field('Notes', (
              <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={3}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, resize: 'vertical' }} />
            ), true)}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 24 }}>
            <button type="button" onClick={onClose} style={btnSecondary}>Cancel</button>
            <button type="submit" style={btnPrimary}>{account ? 'Save' : 'Add Account'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ---- Account Detail Panel ----

function AccountDetailPanel({ account, deals, leads, onClose, onEdit, onDelete, onAddLead, onSelectDeal, onSelectLead, onConvertToOpportunity }) {
  const si = accountStatusInfo(account.status)
  const openDeals = deals.filter(d => d.deal_status === 'open')
  const wonDeals = deals.filter(d => d.deal_status === 'closed_won')
  const totalArr = openDeals.reduce((s, d) => s + (d.new_arr || 0), 0)

  return (
    <div style={overlayStyle} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 640, maxHeight: '90vh', overflow: 'auto' }}>
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4, flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 700, fontSize: 20 }}>🏢 {account.name}</span>
                <span style={{ background: si.bg, color: si.color, borderRadius: 4, padding: '2px 10px', fontSize: 12, fontWeight: 600 }}>{si.label}</span>
              </div>
              <div style={{ fontSize: 13, color: '#64748b' }}>
                {[account.industry, account.country, account.company_size ? `${account.company_size} employees` : ''].filter(Boolean).join(' · ')}
              </div>
              {account.website && (
                <a href={account.website.startsWith('http') ? account.website : `https://${account.website}`} target="_blank" rel="noreferrer"
                  style={{ fontSize: 12, color: '#6366f1' }}>{account.website}</a>
              )}
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#94a3b8' }}>✕</button>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            {onConvertToOpportunity && openDeals.length === 0 && (
              <button onClick={onConvertToOpportunity} style={{ ...btnPrimary, fontSize: 13, padding: '6px 14px' }}>
                🚀 Convert to Opportunity
              </button>
            )}
            <button onClick={onEdit} style={{ ...btnSecondary, fontSize: 13, padding: '6px 14px' }}>Edit</button>
            <button onClick={onDelete} style={{ ...btnSecondary, fontSize: 13, padding: '6px 14px', color: '#ef4444' }}>Delete</button>
          </div>
        </div>

        <div style={{ padding: 24 }}>
          {/* Metrics */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 20 }}>
            <MiniCard label="Open Deals" value={openDeals.length} />
            <MiniCard label="Won Deals" value={wonDeals.length} />
            <MiniCard label="Pipeline ARR" value={fmtMoney(totalArr)} />
            <MiniCard label="Leads" value={leads.length} />
          </div>

          {/* Opportunities */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <SectionLabel>Opportunities</SectionLabel>
          </div>
          {deals.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
              {deals.map(deal => {
                const dsi = statusInfo(deal.deal_status)
                const stageObj = DEAL_STAGES.find(s => s.key === deal.stage)
                return (
                  <div key={deal.id} onClick={() => onSelectDeal(deal.id)} style={{
                    ...cardStyle, padding: 12, cursor: 'pointer', transition: 'all 0.1s',
                  }}
                    onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.08)' }}
                    onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none' }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#6366f1' }}>{deal.opportunity_name || deal.account_name}</div>
                        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                          {stageObj ? stageObj.label : '—'} · {fmtMoney(deal.new_arr)}
                        </div>
                      </div>
                      <span style={{ background: dsi.bg, color: dsi.color, borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>{dsi.label}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div style={{ ...cardStyle, padding: 12, textAlign: 'center', color: '#94a3b8', fontSize: 13, marginBottom: 20 }}>
              No opportunities yet for this account
            </div>
          )}

          {/* Leads */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <SectionLabel>Leads / Contacts</SectionLabel>
            <button onClick={onAddLead} style={{ ...btnPrimary, fontSize: 11, padding: '4px 10px' }}>+ Add Lead</button>
          </div>
          {leads.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
              {leads.map(lead => {
                const lsi = leadStageInfo(lead.stage)
                return (
                  <div key={lead.id} onClick={() => onSelectLead(lead.id)} style={{
                    ...cardStyle, padding: 12, cursor: 'pointer', transition: 'all 0.1s',
                  }}
                    onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.08)' }}
                    onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none' }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{lead.full_name}</div>
                        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                          {lead.title || '—'} {lead.email ? `· ${lead.email}` : ''}
                        </div>
                      </div>
                      <span style={{ background: lsi.bg, color: lsi.color, borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>{lsi.label}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div style={{ ...cardStyle, padding: 12, textAlign: 'center', color: '#94a3b8', fontSize: 13, marginBottom: 20 }}>
              No leads yet. Add contacts from this company to start engaging.
            </div>
          )}

          {/* Notes */}
          {account.notes && (
            <>
              <SectionLabel>Notes</SectionLabel>
              <div style={{ ...cardStyle, padding: 12, fontSize: 13, color: '#374151', whiteSpace: 'pre-wrap', background: '#f8fafc' }}>
                {account.notes}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ---- Leads Tab ----

function LeadsTab({ leads, activeLeads, filteredLeads, stageFilter, setStageFilter, sort, handleSort, onNewLead, onSelectLead }) {
  const stageCounts = {}
  LEAD_STAGES.forEach(s => { stageCounts[s.key] = leads.filter(l => l.stage === s.key).length })

  return (
    <div>
      {/* Metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 24 }}>
        <MetricCard title="Total Leads" value={leads.length} sub={`${activeLeads.length} active`} />
        <MetricCard title="New" value={stageCounts.new || 0} sub="Not contacted" />
        <MetricCard title="Nurturing" value={(stageCounts.engaging || 0) + (stageCounts.nurturing || 0)} sub="In conversation" />
        <MetricCard title="Qualified" value={stageCounts.qualified || 0} sub="Ready to convert" />
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
        <LeadStageFilter stageFilter={stageFilter} setStageFilter={setStageFilter} leads={leads} activeLeads={activeLeads} />
        <button onClick={onNewLead} style={btnPrimary}>+ New Lead</button>
      </div>

      {/* Table */}
      <LeadsTable leads={filteredLeads} sort={sort} handleSort={handleSort} onSelectLead={onSelectLead} />
    </div>
  )
}

// ---- Lead Stage Filter ----

function LeadStageFilter({ stageFilter, setStageFilter, leads, activeLeads }) {
  const opts = [
    { key: 'active', label: 'Active', count: activeLeads.length },
    { key: 'all',    label: 'All',    count: leads.length },
    ...LEAD_STAGES.map(s => ({ key: s.key, label: s.label, count: leads.filter(l => l.stage === s.key).length })),
  ]
  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
      {opts.slice(0, 6).map(o => (
        <button key={o.key} onClick={() => setStageFilter(o.key)} style={{
          background: stageFilter === o.key ? '#6366f1' : '#f1f5f9',
          color: stageFilter === o.key ? '#fff' : '#64748b',
          border: 'none', cursor: 'pointer', borderRadius: 6,
          padding: '6px 12px', fontSize: 12, fontWeight: stageFilter === o.key ? 600 : 400,
          transition: 'all 0.15s',
        }}>
          {o.label} <span style={{ opacity: 0.7 }}>({o.count})</span>
        </button>
      ))}
    </div>
  )
}

// ---- Leads Table ----

function LeadsTable({ leads, sort, handleSort, onSelectLead }) {
  if (leads.length === 0) {
    return (
      <div style={{ ...cardStyle, textAlign: 'center', padding: 48, color: '#94a3b8' }}>
        No leads match the current filter. Click + New Lead to add a prospect.
      </div>
    )
  }

  const cols = [
    { key: 'full_name', label: 'Name' },
    { key: 'title', label: 'Title' },
    { key: 'company', label: 'Company' },
    { key: 'country', label: 'Country' },
    { key: 'source', label: 'Source' },
    { key: 'stage', label: 'Stage' },
    { key: 'next_action_date', label: 'Next Action' },
  ]

  const thStyle = {
    padding: '10px 12px', textAlign: 'left', fontSize: 12, fontWeight: 600,
    color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5,
    cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap', background: '#f8fafc',
  }
  const tdStyle = { padding: '12px 12px', fontSize: 13, color: '#374151', verticalAlign: 'middle' }

  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
            {cols.map(c => (
              <th key={c.key} style={thStyle} onClick={() => handleSort(c.key)}>
                {c.label}
                {sort.field === c.key
                  ? <span style={{ color: '#6366f1', marginLeft: 4 }}>{sort.dir === 'asc' ? '↑' : '↓'}</span>
                  : <span style={{ color: '#cbd5e1', marginLeft: 4 }}>{'↕'}</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {leads.map((lead, i) => {
            const si = leadStageInfo(lead.stage)
            const src = leadSourceInfo(lead.source)
            const nextDays = daysAgo(lead.next_action_date)
            const overdue = lead.next_action_date && nextDays !== null && nextDays > 0
            return (
              <tr key={lead.id} onClick={() => onSelectLead(lead.id)}
                style={{ borderBottom: i < leads.length - 1 ? '1px solid #f1f5f9' : 'none', cursor: 'pointer', transition: 'background 0.1s' }}
                onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <td style={tdStyle}>
                  <div style={{ fontWeight: 600 }}>{lead.full_name || '—'}</div>
                  {lead.email && <div style={{ fontSize: 11, color: '#94a3b8' }}>{lead.email}</div>}
                </td>
                <td style={tdStyle}>{lead.title || '—'}</td>
                <td style={tdStyle}>{lead.company || '—'}</td>
                <td style={tdStyle}>{lead.country || '—'}</td>
                <td style={tdStyle}>
                  <span style={{ color: src.color, fontSize: 12, fontWeight: 500 }}>{src.label}</span>
                </td>
                <td style={tdStyle}>
                  <span style={{ background: si.bg, color: si.color, borderRadius: 4, padding: '2px 8px', fontSize: 12, fontWeight: 500 }}>{si.label}</span>
                </td>
                <td style={tdStyle}>
                  {lead.next_action_date ? (
                    <span style={{ color: overdue ? '#ef4444' : '#374151', fontWeight: overdue ? 600 : 400 }}>
                      {fmtDate(lead.next_action_date)}
                      {lead.next_action && <div style={{ fontSize: 11, color: '#94a3b8', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lead.next_action}</div>}
                    </span>
                  ) : '—'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ---- Lead Form Modal (with enrichment) ----

function LeadFormModal({ lead, accounts = [], onSave, onClose }) {
  const [form, setForm] = useState({
    account_id: lead?.account_id || '',
    full_name: lead?.full_name || '',
    linkedin_url: lead?.linkedin_url || '',
    email: lead?.email || '',
    phone: lead?.phone || '',
    title: lead?.title || '',
    company: lead?.company || '',
    industry: lead?.industry || '',
    country: lead?.country || '',
    source: lead?.source || 'outbound',
    stage: lead?.stage || 'new',
    last_contact_date: lead?.last_contact_date || '',
    last_contact_note: lead?.last_contact_note || '',
    next_action: lead?.next_action || '',
    next_action_date: lead?.next_action_date || '',
    tags: lead?.tags || '',
    notes: lead?.notes || '',
  })
  const [enriching, setEnriching] = useState(false)
  const [enrichError, setEnrichError] = useState('')

  function set(key, val) { setForm(f => ({ ...f, [key]: val })) }

  async function handleEnrich() {
    if (!form.linkedin_url) return
    setEnriching(true)
    setEnrichError('')
    try {
      const res = await fetch('/api/enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ linkedin_url: form.linkedin_url }),
      })
      const data = await res.json()
      if (res.ok) {
        setForm(f => ({
          ...f,
          full_name: data.full_name || f.full_name,
          email: data.email || f.email,
          phone: data.phone || f.phone,
          title: data.title || f.title,
          company: data.company || f.company,
          industry: data.industry || f.industry,
          country: data.country || f.country,
        }))
      } else {
        setEnrichError(data.error || 'Could not enrich this profile')
      }
    } catch {
      setEnrichError('Enrichment not available. Fill in the fields manually.')
    }
    setEnriching(false)
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (!form.full_name.trim() && !form.linkedin_url.trim()) return
    onSave(form)
  }

  const inp = (key, type = 'text', placeholder = '') => (
    <input type={type} value={form[key]} placeholder={placeholder}
      onChange={e => set(key, e.target.value)}
      style={{ width: '100%', padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13 }} />
  )
  const field = (label, content, fullWidth = false) => (
    <div style={{ gridColumn: fullWidth ? '1 / -1' : undefined }}>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#64748b', marginBottom: 4 }}>{label}</label>
      {content}
    </div>
  )

  return (
    <div style={overlayStyle} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 640, maxHeight: '90vh', overflow: 'auto' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{lead?.id ? 'Edit Lead' : 'New Lead'}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#94a3b8' }}>{'✕'}</button>
        </div>
        <form onSubmit={handleSubmit} style={{ padding: 24 }}>
          {/* Account selector */}
          {accounts.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#64748b', marginBottom: 4 }}>Account (Company)</label>
              <select value={form.account_id} onChange={e => {
                const acct = accounts.find(a => a.id === e.target.value)
                set('account_id', e.target.value)
                if (acct) { set('company', acct.name); if (acct.country && !form.country) set('country', acct.country); if (acct.industry && !form.industry) set('industry', acct.industry) }
              }}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, background: '#fff' }}>
                <option value="">— No account (standalone lead) —</option>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
          )}

          {/* LinkedIn URL + Enrich */}
          <div style={{ marginBottom: 20, padding: 16, background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#6366f1', marginBottom: 6 }}>
              LinkedIn URL — Paste and click Enrich to auto-fill
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={form.linkedin_url} placeholder="https://linkedin.com/in/..."
                onChange={e => set('linkedin_url', e.target.value)}
                style={{ flex: 1, padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13 }} />
              <button type="button" onClick={handleEnrich} disabled={enriching || !form.linkedin_url}
                style={{ ...btnPrimary, opacity: enriching || !form.linkedin_url ? 0.5 : 1, whiteSpace: 'nowrap' }}>
                {enriching ? 'Enriching...' : 'Enrich'}
              </button>
            </div>
            {enrichError && <div style={{ marginTop: 6, fontSize: 12, color: '#ef4444' }}>{enrichError}</div>}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {field('Full Name *', inp('full_name'))}
            {field('Email', inp('email', 'email'))}
            {field('Title / Role', inp('title'))}
            {field('Phone', inp('phone', 'tel'))}
            {field('Company', inp('company'))}
            {field('Industry', inp('industry'))}
            {field('Country', (
              <select value={form.country} onChange={e => set('country', e.target.value)}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, background: '#fff' }}>
                <option value="">{'—'} Select {'—'}</option>
                {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            ))}
            {field('Source', (
              <select value={form.source} onChange={e => set('source', e.target.value)}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, background: '#fff' }}>
                {LEAD_SOURCES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            ))}
            {field('Stage', (
              <select value={form.stage} onChange={e => set('stage', e.target.value)}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, background: '#fff' }}>
                {LEAD_STAGES.filter(s => s.key !== 'converted').map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            ))}
            {field('Next Action', inp('next_action', 'text', 'e.g. Send intro email'))}
            {field('Next Action Date', inp('next_action_date', 'date'))}
            {field('Last Contact Date', inp('last_contact_date', 'date'))}
            {field('Last Contact Note', inp('last_contact_note'), true)}
            {field('Tags', inp('tags', 'text', 'e.g. fintech, high-priority'), true)}
            {field('Notes', (
              <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={3}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, resize: 'vertical' }} />
            ), true)}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 24 }}>
            <button type="button" onClick={onClose} style={btnSecondary}>Cancel</button>
            <button type="submit" style={btnPrimary}>{lead?.id ? 'Save Changes' : 'Add Lead'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ---- Lead Detail Panel ----

function LeadDetailPanel({ lead, onClose, onEdit, onDelete, onUpdateStage, onConvert }) {
  const si = leadStageInfo(lead.stage)
  const src = leadSourceInfo(lead.source)
  const daysIn = daysAgo(lead.created_at)
  const lastContactDays = daysAgo(lead.last_contact_date)
  const nextDays = daysAgo(lead.next_action_date)
  const overdue = lead.next_action_date && nextDays !== null && nextDays > 0

  return (
    <div style={overlayStyle} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 560, maxHeight: '90vh', overflow: 'auto' }}>
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                <span style={{ fontWeight: 700, fontSize: 18 }}>{lead.full_name || 'Unknown'}</span>
                <span style={{ background: si.bg, color: si.color, borderRadius: 4, padding: '2px 8px', fontSize: 12, fontWeight: 600 }}>{si.label}</span>
              </div>
              <div style={{ fontSize: 13, color: '#64748b' }}>
                {lead.title && <span>{lead.title}</span>}
                {lead.title && lead.company && <span> at </span>}
                {lead.company && <span style={{ fontWeight: 500 }}>{lead.company}</span>}
              </div>
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#94a3b8', flexShrink: 0 }}>{'✕'}</button>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
            {lead.stage === 'qualified' && (
              <button onClick={onConvert} style={{ ...btnPrimary, background: '#22c55e', fontSize: 13, padding: '6px 14px' }}>Convert to Deal</button>
            )}
            <button onClick={onEdit} style={{ ...btnSecondary, fontSize: 13, padding: '6px 14px' }}>Edit</button>
            <button onClick={onDelete} style={{ ...btnSecondary, fontSize: 13, padding: '6px 14px', color: '#ef4444' }}>Delete</button>
            {lead.linkedin_url && (
              <a href={lead.linkedin_url} target="_blank" rel="noreferrer"
                style={{ ...btnSecondary, fontSize: 13, padding: '6px 14px', textDecoration: 'none', color: '#0077b5', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                onClick={e => e.stopPropagation()}>
                LinkedIn {'↗'}
              </a>
            )}
          </div>
        </div>

        <div style={{ padding: 24 }}>
          {/* Stage selector */}
          <SectionLabel>Stage</SectionLabel>
          <div style={{ display: 'flex', gap: 4, marginBottom: 20, flexWrap: 'wrap' }}>
            {LEAD_STAGES.filter(s => s.key !== 'converted').map(s => (
              <button key={s.key} onClick={() => onUpdateStage(s.key)} style={{
                background: lead.stage === s.key ? s.color : '#f1f5f9',
                color: lead.stage === s.key ? '#fff' : '#64748b',
                border: 'none', borderRadius: 4, padding: '5px 10px', fontSize: 11, fontWeight: 600,
                cursor: 'pointer', transition: 'all 0.15s',
              }}>
                {s.label}
              </button>
            ))}
          </div>

          {/* Contact info */}
          <SectionLabel>Contact</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
            <MiniCard label="Email" value={lead.email || '—'} />
            <MiniCard label="Phone" value={lead.phone || '—'} />
            <MiniCard label="Country" value={lead.country || '—'} />
            <MiniCard label="Source" value={<span style={{ color: src.color, fontWeight: 600 }}>{src.label}</span>} />
          </div>

          {/* Company info */}
          {(lead.company || lead.industry) && (
            <>
              <SectionLabel>Company</SectionLabel>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
                <MiniCard label="Company" value={lead.company || '—'} />
                <MiniCard label="Industry" value={lead.industry || '—'} />
              </div>
            </>
          )}

          {/* Activity */}
          <SectionLabel>Activity</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
            <div style={{ ...cardStyle, padding: 12 }}>
              <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500, marginBottom: 4 }}>LAST CONTACT</div>
              {lead.last_contact_date ? (
                <>
                  <div style={{ fontSize: 13 }}>{fmtDate(lead.last_contact_date)}</div>
                  <div style={{ fontSize: 12, color: lastContactDays > 14 ? '#ef4444' : '#94a3b8' }}>{lastContactDays}d ago</div>
                </>
              ) : <div style={{ fontSize: 13, color: '#94a3b8' }}>{'—'}</div>}
            </div>
            <div style={{ ...cardStyle, padding: 12 }}>
              <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500, marginBottom: 4 }}>NEXT ACTION</div>
              {lead.next_action_date ? (
                <>
                  <div style={{ fontSize: 13, color: overdue ? '#ef4444' : '#374151', fontWeight: overdue ? 600 : 400 }}>
                    {fmtDate(lead.next_action_date)} {overdue && '(overdue!)'}
                  </div>
                  {lead.next_action && <div style={{ fontSize: 12, color: '#64748b' }}>{lead.next_action}</div>}
                </>
              ) : <div style={{ fontSize: 13, color: '#94a3b8' }}>{'—'}</div>}
            </div>
          </div>
          {lead.last_contact_note && (
            <div style={{ ...cardStyle, padding: 12, marginBottom: 20, fontSize: 13, color: '#374151', background: '#f8fafc' }}>
              {lead.last_contact_note}
            </div>
          )}

          {/* Meta */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
            <MiniCard label="In Pipeline" value={daysIn != null ? `${daysIn}d` : '—'} />
            <MiniCard label="Tags" value={lead.tags || '—'} />
          </div>

          {/* Notes */}
          {lead.notes && (
            <>
              <SectionLabel>Notes</SectionLabel>
              <div style={{ ...cardStyle, padding: 12, fontSize: 13, color: '#374151', whiteSpace: 'pre-wrap', background: '#f8fafc' }}>
                {lead.notes}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ---- Lead Delete Modal ----

function LeadDeleteModal({ lead, onConfirm, onClose }) {
  return (
    <div style={overlayStyle}>
      <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 400, padding: 28 }}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 12 }}>Delete Lead</div>
        <div style={{ fontSize: 14, color: '#374151', marginBottom: 24 }}>
          Are you sure you want to delete <strong>{lead.full_name}</strong>? This cannot be undone.
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} style={btnSecondary}>Cancel</button>
          <button onClick={onConfirm} style={btnDanger}>Delete</button>
        </div>
      </div>
    </div>
  )
}

// ---- Convert Lead to Deal Modal ----

function ConvertLeadModal({ lead, onConvert, onClose }) {
  const [form, setForm] = useState({
    account_name: lead.company || lead.full_name || '',
    new_arr: '',
    type: 'new_business',
  })

  function handleSubmit(e) {
    e.preventDefault()
    onConvert(form)
  }

  return (
    <div style={overlayStyle}>
      <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 400, padding: 28 }}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Convert to Deal</div>
        <div style={{ fontSize: 13, color: '#64748b', marginBottom: 20 }}>
          Creating a deal from lead: <strong>{lead.full_name}</strong>
        </div>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#64748b', marginBottom: 4 }}>Account Name</label>
            <input value={form.account_name} onChange={e => setForm(f => ({ ...f, account_name: e.target.value }))}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13 }} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#64748b', marginBottom: 4 }}>Estimated ARR (USD)</label>
            <input type="number" value={form.new_arr} onChange={e => setForm(f => ({ ...f, new_arr: e.target.value }))} placeholder="e.g. 30000"
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13 }} />
          </div>
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#64748b', marginBottom: 4 }}>Type</label>
            <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, background: '#fff' }}>
              <option value="new_business">New Business</option>
              <option value="upsell">Upsell</option>
            </select>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button type="button" onClick={onClose} style={btnSecondary}>Cancel</button>
            <button type="submit" style={{ ...btnPrimary, background: '#22c55e' }}>Create Deal</button>
          </div>
        </form>
      </div>
    </div>
  )
}
