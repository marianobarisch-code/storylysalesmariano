import { useState, useEffect, useRef } from 'react'
import { loadData, saveData, exportToFile, importFromFile, loadFromCloud, saveToCloudDebounced, flushCloudSave } from './storage.js'

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
  { key: 'unreachable',     label: 'Unreachable',     color: '#78716c', bg: '#f5f5f4' },
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

// Activity channels and types for leads
const ACTIVITY_CHANNELS = [
  { key: 'linkedin', label: 'LinkedIn', icon: '🔗', color: '#0077b5' },
  { key: 'email',    label: 'Email',    icon: '📧', color: '#6366f1' },
  { key: 'whatsapp', label: 'WhatsApp', icon: '💬', color: '#25d366' },
  { key: 'phone',    label: 'Phone',    icon: '📞', color: '#f59e0b' },
  { key: 'meeting',  label: 'Meeting',  icon: '📅', color: '#22c55e' },
  { key: 'other',    label: 'Other',    icon: '📋', color: '#94a3b8' },
]

const ACTIVITY_TYPES = {
  linkedin: [
    { key: 'connection_sent',     label: 'Connection request sent',   direction: 'outbound' },
    { key: 'connection_accepted', label: 'Connection accepted',       direction: 'inbound' },
    { key: 'dm_sent',             label: 'DM sent',                   direction: 'outbound' },
    { key: 'dm_received',         label: 'DM received',               direction: 'inbound' },
    { key: 'inmail_sent',         label: 'InMail sent',               direction: 'outbound' },
    { key: 'inmail_received',     label: 'InMail received',           direction: 'inbound' },
    { key: 'post_comment',        label: 'Commented on their post',   direction: 'outbound', warmup: true },
    { key: 'post_like',           label: 'Liked their post',          direction: 'outbound', warmup: true },
    { key: 'post_repost',         label: 'Reposted their content',    direction: 'outbound', warmup: true },
  ],
  email: [
    { key: 'email_sent',     label: 'Email sent',     direction: 'outbound' },
    { key: 'email_received', label: 'Email received',  direction: 'inbound' },
  ],
  whatsapp: [
    { key: 'whatsapp_sent',     label: 'Message sent',     direction: 'outbound' },
    { key: 'whatsapp_received', label: 'Message received',  direction: 'inbound' },
  ],
  phone: [
    { key: 'call_made',     label: 'Call made',       direction: 'outbound' },
    { key: 'call_received', label: 'Call received',    direction: 'inbound' },
  ],
  meeting: [
    { key: 'meeting_scheduled', label: 'Meeting scheduled', direction: 'outbound' },
    { key: 'meeting_held',      label: 'Meeting held',      direction: 'neutral' },
    { key: 'meeting_cancelled', label: 'Meeting cancelled', direction: 'neutral' },
  ],
  other: [
    { key: 'note',   label: 'Note / Comment', direction: 'neutral' },
    { key: 'custom', label: 'Custom event',   direction: 'neutral' },
  ],
}

function activityChannelInfo(key) {
  return ACTIVITY_CHANNELS.find(c => c.key === key) || ACTIVITY_CHANNELS[5]
}

function activityTypeLabel(channel, type) {
  const types = ACTIVITY_TYPES[channel] || []
  const found = types.find(t => t.key === type)
  return found ? found.label : type
}

function activityDirection(channel, type) {
  const types = ACTIVITY_TYPES[channel] || []
  const found = types.find(t => t.key === type)
  return found ? found.direction : 'neutral'
}

function isWarmupActivity(channel, type) {
  const types = ACTIVITY_TYPES[channel] || []
  const found = types.find(t => t.key === type)
  return found ? !!found.warmup : false
}

function daysAgoLabel(dateStr) {
  const d = daysAgo(dateStr)
  if (d === null) return '—'
  if (d === 0) return 'Today'
  if (d === 1) return '1 day ago'
  return `${d}d ago`
}

// ---- Cadence Engine ----
// Calculates the suggested next action based on lead activities and state
// Two modes: PRE-RESPONSE (touchpoint-based outreach) and NURTURING (post-response momentum)

const WARMUP_TYPES = ['post_comment', 'post_like', 'post_repost']
const PASSIVE_INBOUND = ['connection_accepted']
const MAX_TOUCHPOINTS = 4

function calculateCadence(lead) {
  const activities = lead.activities || []
  const hasEmail = !!(lead.email && lead.email.trim())

  // Helper: check if a specific activity type exists
  const has = (ch, type) => activities.some(a => a.channel === ch && a.type === type)

  // Helper: get the date of the last activity of a specific type
  const lastDate = (ch, type) => {
    const found = activities.filter(a => a.channel === ch && a.type === type).sort((a, b) => new Date(b.date) - new Date(a.date))
    return found.length > 0 ? found[0].date : null
  }

  // Calculate days since a date
  const daysSince = (dateStr) => dateStr ? Math.floor((Date.now() - new Date(dateStr)) / 86400000) : null

  // Has any real inbound response? (connection_accepted is passive, doesn't count)
  const hasResponse = activities.some(a => {
    const dir = a.direction || activityDirection(a.channel, a.type)
    return dir === 'inbound' && !PASSIVE_INBOUND.includes(a.type)
  })

  // Dead stages — no cadence
  if (['qualified', 'converted', 'not_interested', 'unreachable'].includes(lead.stage)) {
    return null
  }

  // ==============================
  // NURTURING CADENCE (post-response)
  // Goal: maintain momentum → build rapport → get meeting
  // ==============================
  if (hasResponse || lead.stage === 'nurturing') {
    const sorted = [...activities].sort((a, b) => new Date(b.date) - new Date(a.date))
    const lastAct = sorted[0]
    const daysSinceLast = lastAct ? daysSince(lastAct.date) : null

    // Find the main conversation channel (most recent inbound real response)
    const lastInbound = sorted.find(a => {
      const dir = a.direction || activityDirection(a.channel, a.type)
      return dir === 'inbound' && !PASSIVE_INBOUND.includes(a.type)
    })
    const mainChannel = lastInbound ? lastInbound.channel : 'linkedin'

    // Count real exchanges (non-warmup outbound + real inbound)
    const realOutbound = activities.filter(a => {
      const dir = a.direction || activityDirection(a.channel, a.type)
      return dir === 'outbound' && !WARMUP_TYPES.includes(a.type)
    }).length
    const realInbound = activities.filter(a => {
      const dir = a.direction || activityDirection(a.channel, a.type)
      return dir === 'inbound' && !PASSIVE_INBOUND.includes(a.type)
    }).length

    // Urgency based on days since last interaction
    const nurtureUrgency = (d) => {
      if (d === null) return 'normal'
      if (d >= 4) return 'overdue'
      if (d >= 2) return 'due_soon'
      return 'normal'
    }

    // After enough back-and-forth, suggest meeting
    if (realOutbound >= 2 && realInbound >= 2) {
      return {
        action: 'Propose a meeting — enough rapport built',
        channel: mainChannel,
        type: mainChannel === 'email' ? 'email_sent' : mainChannel === 'linkedin' ? 'dm_sent' : null,
        waitDays: 0,
        dueDate: null,
        step: 3,
        totalSteps: 3,
        urgency: nurtureUrgency(daysSinceLast),
      }
    }

    // First reply: keep momentum going
    const lastDir = lastAct ? (lastAct.direction || activityDirection(lastAct.channel, lastAct.type)) : null

    if (lastDir === 'inbound') {
      // They wrote last — your turn to reply
      return {
        action: daysSinceLast >= 3 ? 'Reply now — conversation cooling!' : 'Reply to keep momentum',
        channel: mainChannel,
        type: mainChannel === 'email' ? 'email_sent' : mainChannel === 'linkedin' ? 'dm_sent' : null,
        waitDays: 0,
        dueDate: null,
        step: Math.min(realOutbound + 1, 2),
        totalSteps: 3,
        urgency: nurtureUrgency(daysSinceLast),
      }
    }

    // You wrote last — waiting for their reply, but don't let it die
    if (daysSinceLast !== null && daysSinceLast >= 3) {
      return {
        action: 'Follow up — re-engage the conversation',
        channel: mainChannel,
        type: mainChannel === 'email' ? 'email_sent' : mainChannel === 'linkedin' ? 'dm_sent' : null,
        waitDays: 3,
        dueDate: lastAct ? new Date(new Date(lastAct.date).getTime() + 3 * 86400000).toISOString().slice(0, 10) : null,
        step: Math.min(realOutbound + 1, 2),
        totalSteps: 3,
        urgency: 'overdue',
      }
    }

    return {
      action: 'Waiting for their reply',
      channel: null,
      type: null,
      waitDays: 3,
      dueDate: lastAct ? new Date(new Date(lastAct.date).getTime() + 3 * 86400000).toISOString().slice(0, 10) : null,
      step: Math.min(realOutbound + 1, 2),
      totalSteps: 3,
      urgency: 'waiting',
    }
  }

  // ==============================
  // PRE-RESPONSE CADENCE (touchpoint-based outreach)
  // Touchpoints = DMs + warm-ups + emails (NOT connection_sent)
  // After MAX_TOUCHPOINTS without response → dead
  // ==============================

  // Step 0: No connection yet → Send LinkedIn connection
  if (!has('linkedin', 'connection_sent')) {
    return {
      action: 'Send LinkedIn connection request',
      channel: 'linkedin',
      type: 'connection_sent',
      waitDays: 0,
      dueDate: null,
      step: 0,
      totalSteps: MAX_TOUCHPOINTS,
      urgency: 'normal',
    }
  }

  const connSentDate = lastDate('linkedin', 'connection_sent')
  const daysSinceConn = daysSince(connSentDate)
  const connAccepted = has('linkedin', 'connection_accepted')

  // Count touchpoints: all outbound EXCEPT connection_sent itself
  const touchpoints = activities.filter(a => {
    if (a.type === 'connection_sent') return false
    const dir = a.direction || activityDirection(a.channel, a.type)
    return dir === 'outbound'
  }).sort((a, b) => new Date(b.date) - new Date(a.date))
  const tpCount = touchpoints.length

  // Last touchpoint info
  const lastTp = touchpoints[0] || null
  const daysSinceLastTp = lastTp ? daysSince(lastTp.date) : null
  const lastWasWarmup = lastTp ? WARMUP_TYPES.includes(lastTp.type) : false
  const WAIT_DAYS = 3

  // Dead after MAX_TOUCHPOINTS
  if (tpCount >= MAX_TOUCHPOINTS) {
    return {
      action: connAccepted ? 'No response after ' + tpCount + ' touchpoints' : 'Unreachable — no response after ' + tpCount + ' attempts',
      channel: null,
      type: null,
      waitDays: 0,
      dueDate: null,
      step: MAX_TOUCHPOINTS,
      totalSteps: MAX_TOUCHPOINTS,
      urgency: 'dead',
      deadType: connAccepted ? 'not_interested' : 'unreachable',
    }
  }

  // ---- ACCEPTED PATH ----
  if (connAccepted) {
    // First touchpoint: always a DM intro
    if (tpCount === 0) {
      return {
        action: 'Send LinkedIn DM (intro message)',
        channel: 'linkedin',
        type: 'dm_sent',
        waitDays: 0,
        dueDate: null,
        step: tpCount + 1,
        totalSteps: MAX_TOUCHPOINTS,
        urgency: 'normal',
      }
    }

    // Subsequent touchpoints: alternate between warm-up and DM
    const dueDate = lastTp ? new Date(new Date(lastTp.date).getTime() + WAIT_DAYS * 86400000).toISOString().slice(0, 10) : null
    const dueInDays = daysSinceLastTp !== null ? WAIT_DAYS - daysSinceLastTp : WAIT_DAYS
    const urgency = dueInDays <= 0 ? 'overdue' : dueInDays <= 1 ? 'due_soon' : 'waiting'

    if (lastWasWarmup) {
      return {
        action: 'Send follow-up DM',
        channel: 'linkedin',
        type: 'dm_sent',
        waitDays: WAIT_DAYS,
        dueDate,
        step: tpCount + 1,
        totalSteps: MAX_TOUCHPOINTS,
        urgency,
      }
    }

    return {
      action: 'Interact with their post or send follow-up DM',
      channel: 'linkedin',
      type: null,
      waitDays: WAIT_DAYS,
      dueDate,
      step: tpCount + 1,
      totalSteps: MAX_TOUCHPOINTS,
      urgency,
    }
  }

  // ---- NOT ACCEPTED PATH ----

  // Still within 3-day window — wait
  if (daysSinceConn !== null && daysSinceConn < 3) {
    return {
      action: 'Waiting for LinkedIn connection to be accepted',
      channel: null,
      type: null,
      waitDays: 3,
      dueDate: connSentDate ? new Date(new Date(connSentDate).getTime() + 3 * 86400000).toISOString().slice(0, 10) : null,
      step: 0,
      totalSteps: MAX_TOUCHPOINTS,
      urgency: 'waiting',
    }
  }

  // 3+ days, not accepted
  if (!hasEmail) {
    // Can still warm up on public posts
    if (tpCount === 0) {
      return {
        action: 'Interact with their post to get noticed',
        channel: 'linkedin',
        type: null,
        waitDays: 0,
        dueDate: null,
        step: tpCount + 1,
        totalSteps: MAX_TOUCHPOINTS,
        urgency: 'normal',
      }
    }
    const dueDate = lastTp ? new Date(new Date(lastTp.date).getTime() + WAIT_DAYS * 86400000).toISOString().slice(0, 10) : null
    const dueInDays = daysSinceLastTp !== null ? WAIT_DAYS - daysSinceLastTp : WAIT_DAYS
    return {
      action: tpCount < MAX_TOUCHPOINTS - 1 ? 'Keep interacting — comment or like posts' : 'Last attempt — engage on their content',
      channel: 'linkedin',
      type: null,
      waitDays: WAIT_DAYS,
      dueDate,
      step: tpCount + 1,
      totalSteps: MAX_TOUCHPOINTS,
      urgency: dueInDays <= 0 ? 'overdue' : dueInDays <= 1 ? 'due_soon' : 'waiting',
    }
  }

  // Has email — email + warm-up touchpoint path
  if (tpCount === 0) {
    return {
      action: 'LinkedIn not accepted — send intro email',
      channel: 'email',
      type: 'email_sent',
      waitDays: 0,
      dueDate: null,
      step: tpCount + 1,
      totalSteps: MAX_TOUCHPOINTS,
      urgency: 'normal',
    }
  }

  const dueDate = lastTp ? new Date(new Date(lastTp.date).getTime() + WAIT_DAYS * 86400000).toISOString().slice(0, 10) : null
  const dueInDays = daysSinceLastTp !== null ? WAIT_DAYS - daysSinceLastTp : WAIT_DAYS
  const urgency = dueInDays <= 0 ? 'overdue' : dueInDays <= 1 ? 'due_soon' : 'waiting'

  if (lastWasWarmup) {
    return {
      action: 'Send follow-up email',
      channel: 'email',
      type: 'email_sent',
      waitDays: WAIT_DAYS,
      dueDate,
      step: tpCount + 1,
      totalSteps: MAX_TOUCHPOINTS,
      urgency,
    }
  }

  return {
    action: 'Interact with their post or send follow-up email',
    channel: 'email',
    type: null,
    waitDays: WAIT_DAYS,
    dueDate,
    step: tpCount + 1,
    totalSteps: MAX_TOUCHPOINTS,
    urgency,
  }
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

// Calendar days from today until a date (positive = future, 0 = today, negative = past)
function daysUntil(dateStr) {
  if (!dateStr) return null
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const target = new Date(String(dateStr).slice(0, 10) + 'T00:00:00')
  return Math.round((target - today) / 86400000)
}

// Most recent activity date on a lead (the "last time you did something")
function lastActivityDate(lead) {
  const dates = (lead.activities || []).map(a => a.date).filter(Boolean).sort()
  return dates.length ? dates[dates.length - 1] : null
}

// Short countdown phrase for a cadence's next action
function cadenceCountdown(cadence) {
  if (!cadence) return null
  if (cadence.urgency === 'dead') return null
  if (cadence.urgency === 'normal') return 'do it now'
  const d = daysUntil(cadence.dueDate)
  if (d == null) return null
  if (d > 1) return `in ${d} days`
  if (d === 1) return 'tomorrow'
  if (d === 0) return 'due today'
  if (d === -1) return '1 day overdue'
  return `${Math.abs(d)} days overdue`
}

// ---- Brand logo icons ----
function LinkedInIcon({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="#0a66c2" style={{ flexShrink: 0 }}>
      <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.13 1.45-2.13 2.94v5.67H9.35V9h3.42v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.22.79 24 1.77 24h20.45c.98 0 1.78-.78 1.78-1.73V1.73C24 .77 23.2 0 22.22 0z"/>
    </svg>
  )
}
function GmailIcon({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" style={{ flexShrink: 0 }}>
      <path fill="#4caf50" d="M45 16.2l-5 2.75-5 4.75L35 40h7c1.657 0 3-1.343 3-3V16.2z"/>
      <path fill="#1e88e5" d="M3 16.2l3.614 1.71L13 23.7V40H6c-1.657 0-3-1.343-3-3V16.2z"/>
      <path fill="#e53935" d="M35 11.2L24 19.45 13 11.2 12 17l1 6.7 11 8.25 11-8.25L36 17z"/>
      <path fill="#c62828" d="M3 12.298V16.2l10 7.5V11.2L9.876 8.859C9.132 8.301 8.228 8 7.298 8 4.924 8 3 9.924 3 12.298z"/>
      <path fill="#fbc02d" d="M45 12.298V16.2l-10 7.5V11.2l3.124-2.341C38.868 8.301 39.772 8 40.702 8 43.076 8 45 9.924 45 12.298z"/>
    </svg>
  )
}
function WhatsAppIcon({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="#25d366" style={{ flexShrink: 0 }}>
      <path d="M.057 24l1.687-6.163a11.867 11.867 0 0 1-1.587-5.945C.16 5.335 5.495 0 12.05 0a11.817 11.817 0 0 1 8.413 3.488 11.824 11.824 0 0 1 3.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 0 1-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 0 0 1.51 5.26l-.999 3.648 3.978-1.039zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.241-.579-.486-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.71.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.247-.694.247-1.289.173-1.413z"/>
    </svg>
  )
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
  const [showCSVImport, setShowCSVImport] = useState(false)
  const [inlineAccountCallback, setInlineAccountCallback] = useState(null) // callback from lead/deal form

  const [cloudStatus, setCloudStatus] = useState('loading') // loading | synced | offline

  useEffect(() => {
    // Migration helpers (defined inside effect to access genId, etc.)
    function migrateAccounts(d) {
      if (!d.accounts) d.accounts = []
      if (!d.settings) d.settings = {}
      if (d.settings._accounts_migrated) return d
      const now = new Date().toISOString()
      const accountMap = new Map()
      ;(d.deals || []).forEach(deal => {
        const name = deal.account_name
        if (name && !accountMap.has(name)) {
          const id = genId()
          accountMap.set(name, {
            id, name, industry: '', country: deal.country || '',
            website: '', company_size: '',
            status: 'customer',
            notes: '', created_at: now, updated_at: now,
          })
        }
        if (name && accountMap.has(name)) deal.account_id = accountMap.get(name).id
      })
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

    function processSaved(saved) {
      let merged = { ...DEFAULT_DATA, ...saved }
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
      if (!merged.deals || merged.deals.length === 0) {
        const now = new Date().toISOString()
        const seededDeals = []; const seededTracks = []; const seededScores = {}
        SEED_DEALS.forEach(seed => {
          const id = genId()
          seededDeals.push({ id, ...seed, contact_name: '', deal_status: 'open', probability: calcProbFromStage(seed.stage), next_step: '', next_step_date: '', activities: [], last_meeting_date: '', last_update_note: '', last_update_date: '', service_order_status: 'not_applicable', flowla_engagement: 'none', flowla_url: '', notes: '', created_at: now, updated_at: now })
          seededTracks.push(...createTrackRows(id)); seededScores[id] = defaultScores()
        })
        merged = { ...merged, deals: seededDeals, tracks: [...(merged.tracks || []), ...seededTracks], scores: { ...merged.scores, ...seededScores } }
      }
      // Migrate existing leads to include activities array and last_response_date
      if (merged.leads && merged.leads.length > 0) {
        merged.leads = merged.leads.map(l => ({
          ...l,
          activities: l.activities || [{ id: genId(), channel: 'other', type: 'note', direction: 'neutral', date: l.created_at || new Date().toISOString(), note: 'Added to lead list' }],
          last_response_date: l.last_response_date || '',
        }))
      }
      return migrateAccounts(merged)
    }

    function seedFreshData() {
      const now = new Date().toISOString()
      const seededDeals = []; const seededTracks = []; const seededScores = {}
      SEED_DEALS.forEach(seed => {
        const id = genId()
        seededDeals.push({ id, ...seed, contact_name: '', deal_status: 'open', probability: calcProbFromStage(seed.stage), next_step: '', next_step_date: '', activities: [], last_meeting_date: '', last_update_note: '', last_update_date: '', service_order_status: 'not_applicable', flowla_engagement: 'none', flowla_url: '', notes: '', created_at: now, updated_at: now })
        seededTracks.push(...createTrackRows(id)); seededScores[id] = defaultScores()
      })
      return migrateAccounts({ ...DEFAULT_DATA, deals: seededDeals, tracks: seededTracks, scores: seededScores })
    }

    // Load: try cloud first, fall back to localStorage
    async function init() {
      const cloudData = await loadFromCloud()
      const localData = loadData()

      if (cloudData) {
        // Cloud has data — use it as source of truth
        setData(processSaved(cloudData))
        saveData(cloudData) // sync local cache
        setCloudStatus('synced')
      } else if (localData) {
        // No cloud data but local exists — use local and push to cloud
        const processed = processSaved(localData)
        setData(processed)
        setCloudStatus('synced')
        // Migrate existing localStorage data to cloud
        saveToCloudDebounced(processed)
      } else {
        // First time ever
        const fresh = seedFreshData()
        setData(fresh)
        setCloudStatus('synced')
        saveToCloudDebounced(fresh)
      }
    }
    init()

    setVisibleCols(defaultCols())
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
  const initDone = useRef(false)

  useEffect(() => {
    // Skip saving during initial load to prevent overwriting cloud data with defaults
    if (!initDone.current) { initDone.current = true; return }
    clearTimeout(saveRef.current)
    saveRef.current = setTimeout(() => {
      saveData(data)              // instant local save
      saveToCloudDebounced(data)  // debounced cloud save (2s)
    }, 400)
    return () => clearTimeout(saveRef.current)
  }, [data])

  // Flush pending saves immediately on page unload
  useEffect(() => {
    function handleBeforeUnload() {
      clearTimeout(saveRef.current)
      saveData(dataRef.current)
      flushCloudSave(dataRef.current)
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
      last_response_date: '',
      next_action: form.next_action || '',
      next_action_date: form.next_action_date || '',
      tags: form.tags || '',
      notes: form.notes || '',
      account_id: form.account_id || '',
      deal_id: null,
      activities: [{ id: genId(), channel: 'other', type: 'note', direction: 'neutral', date: now, note: 'Added to lead list' }],
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

  function addLeadActivity(leadId, activity) {
    const now = new Date().toISOString()
    const dir = activityDirection(activity.channel, activity.type)
    const newActivity = {
      id: genId(),
      channel: activity.channel,
      type: activity.type,
      direction: dir,
      date: activity.date || now,
      note: activity.note || '',
    }
    setData(d => ({
      ...d,
      leads: (d.leads || []).map(l => {
        if (l.id !== leadId) return l
        const activities = [...(l.activities || []), newActivity]
        const updates = { activities, updated_at: now }
        // Auto-update last_contact_date for outbound actions
        if (dir === 'outbound') {
          const actDate = (activity.date || now).slice(0, 10)
          if (!l.last_contact_date || actDate >= l.last_contact_date) {
            updates.last_contact_date = actDate
            updates.last_contact_note = activityTypeLabel(activity.channel, activity.type) + (activity.note ? ` — ${activity.note}` : '')
          }
        }
        // Auto-update last_response_date for inbound actions
        // Note: connection_accepted is passive — not a real "response" for cadence purposes
        const isPassiveInbound = activity.type === 'connection_accepted'
        if (dir === 'inbound' && !isPassiveInbound) {
          const actDate = (activity.date || now).slice(0, 10)
          if (!l.last_response_date || actDate >= l.last_response_date) {
            updates.last_response_date = actDate
          }
          // Auto-progress: if lead is 'new' or 'engaging' and gets a real response → nurturing
          if (['new', 'researching', 'engaging'].includes(l.stage)) {
            updates.stage = 'nurturing'
          }
        }
        // Auto-progress: first outbound contact → engaging (warm-up actions don't count)
        const isWarmup = isWarmupActivity(activity.channel, activity.type)
        if (dir === 'outbound' && l.stage === 'new' && !isWarmup) {
          updates.stage = 'engaging'
        }
        return { ...l, ...updates }
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

  function importCSVData(newAccounts, newLeads) {
    setData(d => {
      const existingAccounts = d.accounts || []
      const existingAccountNames = new Set(existingAccounts.map(a => a.name.toLowerCase()))
      // Only add accounts that don't already exist (by name)
      const accountsToAdd = newAccounts.filter(a => !existingAccountNames.has(a.name.toLowerCase()))
      // Build map: account name → id (existing + new)
      const accountIdMap = new Map()
      existingAccounts.forEach(a => accountIdMap.set(a.name.toLowerCase(), a.id))
      accountsToAdd.forEach(a => accountIdMap.set(a.name.toLowerCase(), a.id))
      // Link leads to accounts
      const linkedLeads = newLeads.map(lead => ({
        ...lead,
        account_id: accountIdMap.get((lead.company || '').toLowerCase()) || lead.account_id || '',
      }))
      return {
        ...d,
        accounts: [...existingAccounts, ...accountsToAdd],
        leads: [...(d.leads || []), ...linkedLeads],
      }
    })
    setShowCSVImport(false)
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
  const activeLeads = allLeads.filter(l => !['converted', 'not_interested', 'unreachable'].includes(l.stage))
  const filteredLeads = (() => {
    let arr = allLeads
    if (leadStageFilter === 'active') arr = activeLeads
    else if (leadStageFilter !== 'all') arr = allLeads.filter(l => l.stage === leadStageFilter)
    const URGENCY_SORT = { overdue: 0, due_soon: 1, normal: 2, waiting: 3, dead: 4 }
    return [...arr].sort((a, b) => {
      if (leadSort.field === 'cadence_urgency') {
        const ca = calculateCadence(a), cb = calculateCadence(b)
        const av = ca ? (URGENCY_SORT[ca.urgency] ?? 5) : 5
        const bv = cb ? (URGENCY_SORT[cb.urgency] ?? 5) : 5
        if (av !== bv) return leadSort.dir === 'asc' ? av - bv : bv - av
        return 0
      }
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
      <Header activeTab={activeTab} setActiveTab={setActiveTab} cloudStatus={cloudStatus} />

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
                onImportCSV={() => setShowCSVImport(true)}
              />
            )}
          </div>
        )}
        {activeTab === 'analytics' && (
          <AnalyticsTab leads={allLeads} accounts={data.accounts || []} deals={data.deals || []} settings={data.settings || {}}
            onUpdateSettings={(s) => setData(d => ({ ...d, settings: { ...d.settings, ...s } }))} />
        )}
      </div>

      {showNewDeal && (
        <DealFormModal
          deal={newDealPrefill}
          accounts={data.accounts || []}
          onSave={(form) => { addDeal(form); setShowNewDeal(false); setNewDealPrefill(null) }}
          onClose={() => { setShowNewDeal(false); setNewDealPrefill(null) }}
          onCreateAccount={(cb) => setInlineAccountCallback(() => cb)}
        />
      )}
      {editDeal && (
        <DealFormModal
          deal={editDeal}
          accounts={data.accounts || []}
          onSave={(form) => { updateDeal(editDeal.id, form); setEditDeal(null) }}
          onClose={() => setEditDeal(null)}
          onCreateAccount={(cb) => setInlineAccountCallback(() => cb)}
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
          onCreateAccount={(cb) => setInlineAccountCallback(() => cb)}
        />
      )}
      {editLeadData && (
        <LeadFormModal
          lead={editLeadData}
          accounts={data.accounts || []}
          onSave={(form) => { updateLeadFn(editLeadData.id, form); setEditLeadData(null) }}
          onClose={() => setEditLeadData(null)}
          onCreateAccount={(cb) => setInlineAccountCallback(() => cb)}
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
          onAddActivity={(activity) => addLeadActivity(selectedLead.id, activity)}
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
      {showCSVImport && (
        <CSVImportModal
          existingAccounts={data.accounts || []}
          onImport={importCSVData}
          onClose={() => setShowCSVImport(false)}
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

      {/* Inline account creation from within Lead/Deal forms */}
      {inlineAccountCallback && (
        <AccountFormModal
          onSave={(form) => {
            const newId = addAccount(form)
            const newAcct = { id: newId, name: form.name, country: form.country || '', industry: form.industry || '' }
            inlineAccountCallback(newAcct)
            setInlineAccountCallback(null)
          }}
          onClose={() => setInlineAccountCallback(null)}
        />
      )}
    </div>
  )
}

// ---- Header ----

function Header({ activeTab, setActiveTab, cloudStatus }) {
  const tabs = [
    { key: 'home', label: 'Home' },
    { key: 'pipeline', label: 'Pipeline Management' },
    { key: 'prospecting', label: 'Prospecting' },
    { key: 'analytics', label: 'Analytics' },
  ]
  const statusIcon = cloudStatus === 'synced' ? '●' : cloudStatus === 'loading' ? '○' : '●'
  const statusColor = cloudStatus === 'synced' ? '#22c55e' : cloudStatus === 'loading' ? '#94a3b8' : '#f59e0b'
  const statusLabel = cloudStatus === 'synced' ? 'Cloud synced' : cloudStatus === 'loading' ? 'Loading...' : 'Offline (local only)'
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
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, padding: '14px 0' }}>
          <span style={{ color: statusColor, fontSize: 10 }}>{statusIcon}</span>
          <span style={{ fontSize: 11, color: '#94a3b8' }}>{statusLabel}</span>
        </div>
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

function DealFormModal({ deal, accounts = [], onSave, onClose, onCreateAccount }) {
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
            {field('Account *', (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <select value={form.account_id} onChange={e => {
                  const acct = accounts.find(a => a.id === e.target.value)
                  set('account_id', e.target.value)
                  if (acct) { set('account_name', acct.name); if (acct.country && !form.country) set('country', acct.country) }
                }}
                  style={{ flex: 1, padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, background: '#fff' }}>
                  <option value="">— Select account —</option>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
                {onCreateAccount && <button type="button" onClick={() => onCreateAccount((newAcct) => { set('account_id', newAcct.id); set('account_name', newAcct.name); if (newAcct.country && !form.country) set('country', newAcct.country) })}
                  style={{ ...btnSecondary, whiteSpace: 'nowrap', fontSize: 12, padding: '8px 12px' }}>+ New</button>}
              </div>
            ))}
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

function LeadsTab({ leads, activeLeads, filteredLeads, stageFilter, setStageFilter, sort, handleSort, onNewLead, onSelectLead, onImportCSV }) {
  const [showNewMenu, setShowNewMenu] = useState(false)
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
        <div style={{ position: 'relative' }}>
          <button onClick={() => setShowNewMenu(m => !m)} style={btnPrimary}>+ New Lead</button>
          {showNewMenu && (
            <>
              <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setShowNewMenu(false)} />
              <div style={{ position: 'absolute', right: 0, top: '100%', marginTop: 4, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 100, overflow: 'hidden', minWidth: 180 }}>
                <button onClick={() => { setShowNewMenu(false); onNewLead() }} style={{ display: 'block', width: '100%', padding: '10px 16px', border: 'none', background: 'none', textAlign: 'left', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'} onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                  Add manually
                </button>
                <div style={{ height: 1, background: '#f1f5f9' }} />
                <button onClick={() => { setShowNewMenu(false); onImportCSV() }} style={{ display: 'block', width: '100%', padding: '10px 16px', border: 'none', background: 'none', textAlign: 'left', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'} onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                  Import CSV
                </button>
              </div>
            </>
          )}
        </div>
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
    { key: 'cadence_urgency', label: 'Action' },
  ]

  // Urgency sort order: overdue first, then due_soon, normal, waiting, dead, null last
  const URGENCY_ORDER = { overdue: 0, due_soon: 1, normal: 2, waiting: 3, dead: 4 }

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
            const cadence = calculateCadence(lead)
            const urgencyStyles = {
              overdue:  { bg: '#fef2f2', color: '#ef4444', label: '⚠ Action Required' },
              due_soon: { bg: '#fffbeb', color: '#f59e0b', label: 'Due Soon' },
              normal:   { bg: '#f0fdf4', color: '#22c55e', label: '→ Next Step' },
              waiting:  { bg: '#f0f9ff', color: '#3b82f6', label: 'Waiting' },
              dead:     { bg: '#f5f5f4', color: '#78716c', label: 'End' },
            }
            const us = cadence ? urgencyStyles[cadence.urgency] : null
            return (
              <tr key={lead.id} onClick={() => onSelectLead(lead.id)}
                style={{ borderBottom: i < leads.length - 1 ? '1px solid #f1f5f9' : 'none', cursor: 'pointer', transition: 'background 0.1s', background: cadence?.urgency === 'overdue' ? '#fffbfb' : 'transparent' }}
                onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                onMouseLeave={e => e.currentTarget.style.background = cadence?.urgency === 'overdue' ? '#fffbfb' : 'transparent'}>
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
                  {us ? (
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ background: us.bg, color: us.color, borderRadius: 4, padding: '2px 8px', fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap' }}>{us.label}</span>
                        {(() => {
                          const cd = cadenceCountdown(cadence)
                          if (!cd || cadence.urgency === 'normal') return null
                          const c = cadence.urgency === 'overdue' ? '#ef4444' : cadence.urgency === 'due_soon' ? '#d97706' : '#64748b'
                          return <span style={{ fontSize: 10, color: c, fontWeight: 600, whiteSpace: 'nowrap' }}>⏱ {cd}</span>
                        })()}
                      </div>
                      {cadence.action && <div style={{ fontSize: 11, color: '#64748b', marginTop: 3, maxWidth: 170, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cadence.action}</div>}
                    </div>
                  ) : (
                    <span style={{ fontSize: 12, color: '#94a3b8' }}>—</span>
                  )}
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

function LeadFormModal({ lead, accounts = [], onSave, onClose, onCreateAccount }) {
  const isEditing = !!lead?.id
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
  const [accountSearch, setAccountSearch] = useState(() => {
    if (lead?.account_id) {
      const match = accounts.find(a => a.id === lead.account_id)
      return match ? match.name : ''
    }
    return ''
  })
  const [showAccountDropdown, setShowAccountDropdown] = useState(false)
  const [showSecondary, setShowSecondary] = useState(isEditing)
  const [showActivity, setShowActivity] = useState(false)
  const accountInputRef = useRef(null)

  const filteredAccounts = accountSearch.trim()
    ? accounts.filter(a => a.name.toLowerCase().includes(accountSearch.toLowerCase()))
    : accounts

  function set(key, val) { setForm(f => ({ ...f, [key]: val })) }

  function selectAccount(acct) {
    set('account_id', acct.id)
    set('company', acct.name)
    if (acct.country && !form.country) set('country', acct.country)
    if (acct.industry && !form.industry) set('industry', acct.industry)
    setAccountSearch(acct.name)
    setShowAccountDropdown(false)
  }

  function clearAccount() {
    set('account_id', '')
    setAccountSearch('')
  }

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

  const toggleBtn = (label, isOpen, toggle) => (
    <button type="button" onClick={toggle}
      style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: '1px solid #e2e8f0', borderRadius: 6, padding: '6px 12px', fontSize: 12, fontWeight: 500, color: '#64748b', cursor: 'pointer', marginTop: 8 }}>
      <span style={{ transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s', display: 'inline-block' }}>▶</span>
      {label}
    </button>
  )

  return (
    <div style={overlayStyle} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 640, maxHeight: '90vh', overflow: 'auto' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{isEditing ? 'Edit Lead' : 'New Lead'}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#94a3b8' }}>{'✕'}</button>
        </div>
        <form onSubmit={handleSubmit} style={{ padding: 24 }}>
          {/* Account — searchable input */}
          <div style={{ marginBottom: 16, position: 'relative' }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#64748b', marginBottom: 4 }}>Account (Company)</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <div style={{ flex: 1, position: 'relative' }}>
                <input ref={accountInputRef} type="text" value={accountSearch}
                  placeholder="Type to search accounts..."
                  onChange={e => { setAccountSearch(e.target.value); set('account_id', ''); setShowAccountDropdown(true) }}
                  onFocus={() => setShowAccountDropdown(true)}
                  style={{ width: '100%', padding: '8px 10px', paddingRight: form.account_id ? 28 : 10, border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, background: form.account_id ? '#f0fdf4' : '#fff' }} />
                {form.account_id && (
                  <button type="button" onClick={clearAccount}
                    style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 14, padding: 2 }}>✕</button>
                )}
                {showAccountDropdown && (
                  <>
                    <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setShowAccountDropdown(false)} />
                    <div style={{ position: 'absolute', left: 0, right: 0, top: '100%', marginTop: 2, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 100, maxHeight: 200, overflow: 'auto' }}>
                      {filteredAccounts.length > 0 ? filteredAccounts.map(a => (
                        <button key={a.id} type="button" onClick={() => selectAccount(a)}
                          style={{ display: 'block', width: '100%', padding: '8px 12px', border: 'none', background: a.id === form.account_id ? '#f0fdf4' : 'none', textAlign: 'left', cursor: 'pointer', fontSize: 13 }}
                          onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'} onMouseLeave={e => e.currentTarget.style.background = a.id === form.account_id ? '#f0fdf4' : 'none'}>
                          <div style={{ fontWeight: 500 }}>{a.name}</div>
                          {(a.country || a.industry) && <div style={{ fontSize: 11, color: '#94a3b8' }}>{[a.industry, a.country].filter(Boolean).join(' · ')}</div>}
                        </button>
                      )) : (
                        <div style={{ padding: '10px 12px', fontSize: 12, color: '#94a3b8' }}>No matching accounts</div>
                      )}
                      {onCreateAccount && (
                        <>
                          <div style={{ height: 1, background: '#f1f5f9' }} />
                          <button type="button" onClick={() => { setShowAccountDropdown(false); onCreateAccount((newAcct) => { selectAccount(newAcct) }) }}
                            style={{ display: 'block', width: '100%', padding: '8px 12px', border: 'none', background: 'none', textAlign: 'left', cursor: 'pointer', fontSize: 13, color: '#6366f1', fontWeight: 500 }}
                            onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'} onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                            + Create new account{accountSearch.trim() ? `: "${accountSearch.trim()}"` : ''}
                          </button>
                        </>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

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

          {/* Primary fields — always visible */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {field('Full Name *', inp('full_name'))}
            {field('Email', inp('email', 'email'))}
            {field('Title / Role', inp('title'))}
            {field('Company', inp('company'))}
          </div>

          {/* Secondary fields — toggle */}
          {toggleBtn(showSecondary ? 'Hide additional fields' : 'Show additional fields (country, industry, source...)', showSecondary, () => setShowSecondary(s => !s))}
          {showSecondary && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 12, padding: 16, background: '#fafbfc', borderRadius: 8, border: '1px solid #f1f5f9' }}>
              {field('Phone', inp('phone', 'tel'))}
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
            </div>
          )}

          {/* Activity fields — only when editing, toggle */}
          {isEditing && (
            <>
              {toggleBtn(showActivity ? 'Hide activity fields' : 'Show activity fields (next action, notes, tags...)', showActivity, () => setShowActivity(a => !a))}
              {showActivity && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 12, padding: 16, background: '#fafbfc', borderRadius: 8, border: '1px solid #f1f5f9' }}>
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
              )}
            </>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 24 }}>
            <button type="button" onClick={onClose} style={btnSecondary}>Cancel</button>
            <button type="submit" style={btnPrimary}>{isEditing ? 'Save Changes' : 'Add Lead'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ---- Lead Detail Panel ----

function LeadDetailPanel({ lead, onClose, onEdit, onDelete, onUpdateStage, onConvert, onAddActivity }) {
  const si = leadStageInfo(lead.stage)
  const src = leadSourceInfo(lead.source)
  const daysIn = daysAgo(lead.created_at)
  const lastContactDays = daysAgo(lead.last_contact_date)
  const lastResponseDays = daysAgo(lead.last_response_date)
  const nextDays = daysAgo(lead.next_action_date)
  const overdue = lead.next_action_date && nextDays !== null && nextDays > 0
  const activities = [...(lead.activities || [])].sort((a, b) => new Date(b.date) - new Date(a.date))
  const cadence = calculateCadence(lead)

  const [showAddActivity, setShowAddActivity] = useState(false)
  const [actChannel, setActChannel] = useState('linkedin')
  const [actType, setActType] = useState('connection_sent')
  const [actNote, setActNote] = useState('')
  const [actDate, setActDate] = useState(new Date().toISOString().slice(0, 10))

  function handleAddActivity(e) {
    e.preventDefault()
    onAddActivity({ channel: actChannel, type: actType, note: actNote, date: new Date(actDate + 'T12:00:00').toISOString() })
    setActNote('')
    setShowAddActivity(false)
    // Reset to defaults
    setActChannel('linkedin')
    setActType('connection_sent')
    setActDate(new Date().toISOString().slice(0, 10))
  }

  // When channel changes, auto-select first type of that channel
  function handleChannelChange(ch) {
    setActChannel(ch)
    const types = ACTIVITY_TYPES[ch] || []
    if (types.length > 0) setActType(types[0].key)
  }

  return (
    <div style={overlayStyle} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 600, maxHeight: '90vh', overflow: 'auto' }}>
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
                style={{ ...btnSecondary, fontSize: 13, padding: '6px 12px', textDecoration: 'none', color: '#0a66c2', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                onClick={e => e.stopPropagation()}>
                <LinkedInIcon /> LinkedIn
              </a>
            )}
            {lead.email && (
              <a href={`https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(lead.email)}`} target="_blank" rel="noreferrer"
                style={{ ...btnSecondary, fontSize: 13, padding: '6px 12px', textDecoration: 'none', color: '#374151', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                onClick={e => e.stopPropagation()}>
                <GmailIcon /> Email
              </a>
            )}
            {lead.phone && (
              <a href={`https://wa.me/${String(lead.phone).replace(/[^0-9]/g, '')}`} target="_blank" rel="noreferrer"
                style={{ ...btnSecondary, fontSize: 13, padding: '6px 12px', textDecoration: 'none', color: '#1f7a3d', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                onClick={e => e.stopPropagation()}>
                <WhatsAppIcon /> WhatsApp
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

          {/* Summary cards */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 20 }}>
            <div style={{ ...cardStyle, padding: 10 }}>
              <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, marginBottom: 2 }}>IN PIPELINE</div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{daysIn === 0 ? 'Today' : daysIn != null ? `${daysIn}d` : '—'}</div>
            </div>
            <div style={{ ...cardStyle, padding: 10 }}>
              <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, marginBottom: 2 }}>LAST OUTREACH</div>
              <div style={{ fontSize: 13, fontWeight: 500, color: lastContactDays > 14 ? '#ef4444' : '#374151' }}>
                {lead.last_contact_date ? daysAgoLabel(lead.last_contact_date) : '—'}
              </div>
            </div>
            <div style={{ ...cardStyle, padding: 10 }}>
              <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, marginBottom: 2 }}>LAST RESPONSE</div>
              <div style={{ fontSize: 13, fontWeight: 500, color: lastResponseDays > 14 ? '#f59e0b' : '#374151' }}>
                {lead.last_response_date ? daysAgoLabel(lead.last_response_date) : '—'}
              </div>
            </div>
          </div>

          {/* Cadence-driven Next Action */}
          {cadence && (
            <div style={{
              ...cardStyle, padding: 14, marginBottom: 20,
              background: cadence.urgency === 'overdue' ? '#fef2f2' : cadence.urgency === 'due_soon' ? '#fffbeb' : cadence.urgency === 'dead' ? '#f8fafc' : cadence.urgency === 'waiting' ? '#f0f9ff' : '#f0fdf4',
              border: `1px solid ${cadence.urgency === 'overdue' ? '#fecaca' : cadence.urgency === 'due_soon' ? '#fde68a' : cadence.urgency === 'dead' ? '#e2e8f0' : cadence.urgency === 'waiting' ? '#bae6fd' : '#bbf7d0'}`,
            }}>
              {/* Header with urgency badge */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {cadence.urgency === 'overdue' && <span style={{ background: '#ef4444', color: '#fff', borderRadius: 4, padding: '2px 8px', fontSize: 10, fontWeight: 700 }}>⚠ ACTION REQUIRED</span>}
                  {cadence.urgency === 'due_soon' && <span style={{ background: '#f59e0b', color: '#fff', borderRadius: 4, padding: '2px 8px', fontSize: 10, fontWeight: 700 }}>DUE SOON</span>}
                  {cadence.urgency === 'waiting' && <span style={{ background: '#3b82f6', color: '#fff', borderRadius: 4, padding: '2px 8px', fontSize: 10, fontWeight: 700 }}>WAITING</span>}
                  {cadence.urgency === 'normal' && <span style={{ background: '#22c55e', color: '#fff', borderRadius: 4, padding: '2px 8px', fontSize: 10, fontWeight: 700 }}>→ NEXT STEP</span>}
                  {cadence.urgency === 'dead' && <span style={{ background: '#94a3b8', color: '#fff', borderRadius: 4, padding: '2px 8px', fontSize: 10, fontWeight: 700 }}>END OF CADENCE</span>}
                </div>
                <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500 }}>
                  Step {cadence.step}/{cadence.totalSteps}
                </div>
              </div>

              {/* Action description */}
              <div style={{ fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 4 }}>
                {cadence.channel && activityChannelInfo(cadence.channel).icon} {cadence.action}
              </div>

              {/* Countdown + last-touch context */}
              {(() => {
                const countdown = cadenceCountdown(cadence)
                const lastTouch = lastActivityDate(lead)
                const lastDays = daysAgo(lastTouch)
                const cdColor = cadence.urgency === 'overdue' ? '#ef4444' : cadence.urgency === 'due_soon' ? '#d97706' : cadence.urgency === 'normal' ? '#16a34a' : '#3b82f6'
                return (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 12, marginBottom: 8 }}>
                    {countdown && cadence.urgency !== 'normal' && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: cdColor, fontWeight: 600 }}>
                        ⏱ Next action {countdown}
                        {cadence.dueDate && <span style={{ color: '#94a3b8', fontWeight: 400 }}>({fmtDate(cadence.dueDate)})</span>}
                      </span>
                    )}
                    {countdown && cadence.urgency === 'normal' && (
                      <span style={{ color: cdColor, fontWeight: 600 }}>⏱ Ready now</span>
                    )}
                    {lastTouch && (
                      <span style={{ color: '#94a3b8' }}>
                        · Last touch {lastDays === 0 ? 'today' : lastDays === 1 ? 'yesterday' : `${lastDays}d ago`}
                      </span>
                    )}
                  </div>
                )
              })()}

              {/* Quick action buttons */}
              <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                {cadence.channel && cadence.type && cadence.urgency !== 'waiting' && cadence.urgency !== 'dead' && (
                  <button onClick={() => onAddActivity({ channel: cadence.channel, type: cadence.type, note: cadence.action, date: new Date().toISOString() })}
                    style={{ ...btnPrimary, fontSize: 12, padding: '6px 14px' }}>
                    ✓ Mark as Done
                  </button>
                )}
                {cadence.channel && cadence.type && cadence.urgency === 'waiting' && (
                  <button onClick={() => onAddActivity({ channel: cadence.channel, type: cadence.type, note: cadence.action, date: new Date().toISOString() })}
                    style={{ ...btnSecondary, fontSize: 12, padding: '6px 14px' }}>
                    ✓ Done Early
                  </button>
                )}
                {cadence.channel && !cadence.type && cadence.urgency !== 'waiting' && cadence.urgency !== 'dead' && (
                  <button onClick={() => setShowAddActivity(true)}
                    style={{ ...btnPrimary, fontSize: 12, padding: '6px 14px' }}>
                    📝 Log Touchpoint
                  </button>
                )}
                {cadence.urgency === 'dead' && cadence.deadType === 'unreachable' && (
                  <button onClick={() => onUpdateStage('unreachable')}
                    style={{ ...btnSecondary, fontSize: 12, padding: '6px 14px', color: '#78716c' }}>
                    Mark Unreachable
                  </button>
                )}
                {cadence.urgency === 'dead' && cadence.deadType !== 'unreachable' && (
                  <button onClick={() => onUpdateStage('not_interested')}
                    style={{ ...btnSecondary, fontSize: 12, padding: '6px 14px', color: '#94a3b8' }}>
                    Mark Not Interested
                  </button>
                )}
                {cadence.urgency === 'dead' && (
                  <button onClick={() => onUpdateStage(cadence.deadType === 'unreachable' ? 'not_interested' : 'unreachable')}
                    style={{ ...btnSecondary, fontSize: 11, padding: '6px 14px', color: '#94a3b8' }}>
                    or {cadence.deadType === 'unreachable' ? 'Not Interested' : 'Unreachable'}
                  </button>
                )}
                {cadence.urgency === 'overdue' && cadence.urgency !== 'dead' && (
                  <button onClick={() => onAddActivity({ channel: cadence.channel || 'other', type: cadence.type || 'note', note: 'Skipped — moving on', date: new Date().toISOString() })}
                    style={{ ...btnSecondary, fontSize: 12, padding: '6px 14px' }}>
                    Skip this step
                  </button>
                )}
              </div>

              {/* Progress bar */}
              <div style={{ marginTop: 10, background: '#e2e8f0', borderRadius: 4, height: 4, overflow: 'hidden' }}>
                <div style={{ height: '100%', borderRadius: 4, background: cadence.urgency === 'overdue' ? '#ef4444' : cadence.urgency === 'dead' ? '#94a3b8' : '#6366f1', width: `${(cadence.step / cadence.totalSteps) * 100}%`, transition: 'width 0.3s' }} />
              </div>
            </div>
          )}

          {/* Manual next action (if set via edit form, shown alongside cadence) */}
          {(lead.next_action || lead.next_action_date) && (
            <div style={{ ...cardStyle, padding: 10, marginBottom: 20, background: overdue ? '#fef2f2' : '#f8fafc', border: `1px solid ${overdue ? '#fecaca' : '#e2e8f0'}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: overdue ? '#ef4444' : '#94a3b8', marginBottom: 2 }}>
                    {overdue ? '⚠ MANUAL ACTION OVERDUE' : 'MANUAL NEXT ACTION'}
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 500 }}>{lead.next_action || 'Follow up'}</div>
                </div>
                <div style={{ fontSize: 11, color: '#64748b' }}>
                  {lead.next_action_date ? fmtDate(lead.next_action_date) : ''}
                </div>
              </div>
            </div>
          )}

          {/* Contact info — compact */}
          <SectionLabel>Contact</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
            <MiniCard label="Email" value={lead.email || '—'} />
            <MiniCard label="Phone" value={lead.phone || '—'} />
            <MiniCard label="Country" value={lead.country || '—'} />
            <MiniCard label="Source" value={<span style={{ color: src.color, fontWeight: 600 }}>{src.label}</span>} />
          </div>

          {/* Activity Timeline */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <SectionLabel style={{ margin: 0 }}>Activity Timeline</SectionLabel>
            <button onClick={() => setShowAddActivity(a => !a)}
              style={{ ...btnPrimary, fontSize: 12, padding: '5px 12px' }}>
              + Log Activity
            </button>
          </div>

          {/* Add Activity Form */}
          {showAddActivity && (
            <form onSubmit={handleAddActivity} style={{ ...cardStyle, padding: 16, marginBottom: 16, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                {ACTIVITY_CHANNELS.map(ch => (
                  <button key={ch.key} type="button" onClick={() => handleChannelChange(ch.key)}
                    style={{
                      padding: '5px 10px', borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: 'pointer',
                      border: actChannel === ch.key ? `2px solid ${ch.color}` : '1px solid #e2e8f0',
                      background: actChannel === ch.key ? ch.color + '15' : '#fff',
                      color: actChannel === ch.key ? ch.color : '#64748b',
                    }}>
                    {ch.icon} {ch.label}
                  </button>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: '#64748b', marginBottom: 3 }}>Type</label>
                  <select value={actType} onChange={e => setActType(e.target.value)}
                    style={{ width: '100%', padding: '7px 8px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 12, background: '#fff' }}>
                    {(ACTIVITY_TYPES[actChannel] || []).map(t => (
                      <option key={t.key} value={t.key}>
                        {t.direction === 'outbound' ? '↑ ' : t.direction === 'inbound' ? '↓ ' : ''}{t.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: '#64748b', marginBottom: 3 }}>Date</label>
                  <input type="date" value={actDate} onChange={e => setActDate(e.target.value)}
                    style={{ width: '100%', padding: '7px 8px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 12 }} />
                </div>
              </div>
              <div style={{ marginBottom: 10 }}>
                <input type="text" value={actNote} onChange={e => setActNote(e.target.value)}
                  placeholder="Note (optional) — e.g. subject, context..."
                  style={{ width: '100%', padding: '7px 8px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 12 }} />
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setShowAddActivity(false)} style={{ ...btnSecondary, fontSize: 12, padding: '5px 12px' }}>Cancel</button>
                <button type="submit" style={{ ...btnPrimary, fontSize: 12, padding: '5px 12px' }}>Log Activity</button>
              </div>
            </form>
          )}

          {/* Timeline */}
          <div style={{ position: 'relative', paddingLeft: 24 }}>
            {/* Vertical line */}
            {activities.length > 0 && (
              <div style={{ position: 'absolute', left: 7, top: 6, bottom: 6, width: 2, background: '#e2e8f0', borderRadius: 1 }} />
            )}
            {activities.length > 0 ? activities.map((act, i) => {
              const ch = activityChannelInfo(act.channel)
              const dir = act.direction || activityDirection(act.channel, act.type)
              const isInbound = dir === 'inbound'
              const isOutbound = dir === 'outbound'
              return (
                <div key={act.id || i} style={{ position: 'relative', paddingBottom: i < activities.length - 1 ? 12 : 0, paddingLeft: 16 }}>
                  {/* Dot */}
                  <div style={{
                    position: 'absolute', left: -24, top: 3, width: 16, height: 16, borderRadius: '50%',
                    background: ch.color + '20', border: `2px solid ${ch.color}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8,
                  }}>
                    {isOutbound ? '↑' : isInbound ? '↓' : '·'}
                  </div>
                  {/* Content */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: '#374151' }}>
                        <span style={{ color: ch.color, marginRight: 4 }}>{ch.icon}</span>
                        {activityTypeLabel(act.channel, act.type)}
                        {isOutbound && <span style={{ fontSize: 10, color: '#94a3b8', marginLeft: 6 }}>SENT</span>}
                        {isInbound && <span style={{ fontSize: 10, color: '#22c55e', marginLeft: 6, fontWeight: 600 }}>RECEIVED</span>}
                      </div>
                      {act.note && <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{act.note}</div>}
                    </div>
                    <div style={{ fontSize: 11, color: '#94a3b8', whiteSpace: 'nowrap', flexShrink: 0 }}>
                      {fmtDate(act.date)}
                    </div>
                  </div>
                </div>
              )
            }) : (
              <div style={{ fontSize: 13, color: '#94a3b8', padding: '8px 0' }}>
                No activities yet. Click "Log Activity" to start tracking.
              </div>
            )}
          </div>

          {/* Tags & Notes */}
          {(lead.tags || lead.notes) && (
            <div style={{ marginTop: 20 }}>
              {lead.tags && (
                <div style={{ marginBottom: 8 }}>
                  <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500 }}>Tags: </span>
                  {lead.tags.split(',').map((t, i) => (
                    <span key={i} style={{ display: 'inline-block', background: '#eef2ff', color: '#6366f1', borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 500, marginRight: 4 }}>
                      {t.trim()}
                    </span>
                  ))}
                </div>
              )}
              {lead.notes && (
                <>
                  <SectionLabel>Notes</SectionLabel>
                  <div style={{ ...cardStyle, padding: 12, fontSize: 13, color: '#374151', whiteSpace: 'pre-wrap', background: '#f8fafc' }}>
                    {lead.notes}
                  </div>
                </>
              )}
            </div>
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

// ---- CSV Import Modal ----

function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return { headers: [], rows: [] }
  function splitRow(line) {
    const result = []; let current = ''; let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') { inQuotes = !inQuotes; continue }
      if (ch === ',' && !inQuotes) { result.push(current.trim()); current = ''; continue }
      current += ch
    }
    result.push(current.trim())
    return result
  }
  const headers = splitRow(lines[0]).map(h => h.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, ''))
  const rows = lines.slice(1).map(line => {
    const vals = splitRow(line)
    const obj = {}
    headers.forEach((h, i) => { obj[h] = vals[i] || '' })
    return obj
  }).filter(row => Object.values(row).some(v => v))
  return { headers, rows }
}

function mapCSVField(header) {
  const map = {
    'company': 'company', 'company_name': 'company', 'empresa': 'company', 'organization': 'company', 'org': 'company', 'account': 'company', 'account_name': 'company', 'organization_name': 'company',
    'full_name': 'full_name', 'name': 'full_name', 'nombre': 'full_name', 'contact_name': 'full_name', 'contact': 'full_name', 'person': 'full_name',
    'first_name': 'first_name', 'last_name': 'last_name',
    'email': 'email', 'email_address': 'email', 'correo': 'email', 'e_mail': 'email',
    'title': 'title', 'job_title': 'title', 'position': 'title', 'cargo': 'title', 'titulo': 'title', 'role': 'title',
    'linkedin_url': 'linkedin_url', 'linkedin': 'linkedin_url', 'profile_url': 'linkedin_url', 'person_linkedin_url': 'linkedin_url',
    'phone': 'phone', 'phone_number': 'phone', 'telefono': 'phone', 'mobile': 'phone',
    'country': 'country', 'pais': 'country', 'location': 'country',
    'industry': 'industry', 'industria': 'industry', 'sector': 'industry',
    'company_size': 'company_size', 'employees': 'company_size', 'number_of_employees': 'company_size', 'of_employees': 'company_size',
    'website': 'website', 'company_website': 'website', 'sitio_web': 'website',
  }
  return map[header] || null
}

function CSVImportModal({ existingAccounts, onImport, onClose }) {
  const [step, setStep] = useState('upload')
  const [parsed, setParsed] = useState({ headers: [], rows: [] })
  const [fieldMap, setFieldMap] = useState({})
  const [preview, setPreview] = useState({ accounts: [], leads: [] })
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef(null)

  const OUR_FIELDS = [
    { key: '', label: '— Skip —' },
    { key: 'company', label: 'Company' },
    { key: 'full_name', label: 'Full Name' },
    { key: 'first_name', label: 'First Name' },
    { key: 'last_name', label: 'Last Name' },
    { key: 'email', label: 'Email' },
    { key: 'title', label: 'Title / Position' },
    { key: 'linkedin_url', label: 'LinkedIn URL' },
    { key: 'phone', label: 'Phone' },
    { key: 'country', label: 'Country' },
    { key: 'industry', label: 'Industry' },
    { key: 'source', label: 'Source' },
    { key: 'company_size', label: 'Company Size' },
    { key: 'website', label: 'Website' },
  ]

  function handleFileSelect(file) {
    if (!file) return
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target.result
      processCSV(text)
    }
    reader.readAsText(file)
  }

  function processCSV(text) {
    const { headers, rows } = parseCSV(text)
    if (headers.length === 0 || rows.length === 0) return
    setParsed({ headers, rows })
    const autoMap = {}
    headers.forEach(h => {
      const mapped = mapCSVField(h)
      if (mapped) autoMap[h] = mapped
    })
    setFieldMap(autoMap)
    setStep('mapping')
  }

  function generatePreview() {
    const { rows } = parsed
    const now = new Date().toISOString()
    const existingNames = new Set(existingAccounts.map(a => a.name.toLowerCase()))
    const accountMap = new Map()
    const leads = []

    rows.forEach(row => {
      const lead = { id: genId(), stage: 'new', source: 'outbound', created_at: now, updated_at: now, deal_id: null, account_id: '', last_contact_date: '', last_contact_note: '', next_action: '', next_action_date: '', tags: '', notes: '' }
      let firstName = '', lastName = ''
      let companyData = { industry: '', country: '', company_size: '', website: '' }

      Object.entries(fieldMap).forEach(([csvHeader, ourField]) => {
        const val = row[csvHeader] || ''
        if (!val) return
        if (ourField === 'first_name') { firstName = val }
        else if (ourField === 'last_name') { lastName = val }
        else if (ourField === 'company') { lead.company = val }
        else if (ourField === 'industry') { lead.industry = val; companyData.industry = val }
        else if (ourField === 'country') { lead.country = val; companyData.country = val }
        else if (ourField === 'company_size') { companyData.company_size = val }
        else if (ourField === 'website') { companyData.website = val }
        else { lead[ourField] = val }
      })

      if (!lead.full_name && (firstName || lastName)) {
        lead.full_name = [firstName, lastName].filter(Boolean).join(' ')
      }
      if (!lead.full_name && !lead.company) return

      const companyName = lead.company || ''
      if (companyName && !existingNames.has(companyName.toLowerCase()) && !accountMap.has(companyName.toLowerCase())) {
        accountMap.set(companyName.toLowerCase(), {
          id: genId(), name: companyName,
          industry: companyData.industry, country: companyData.country,
          website: companyData.website, company_size: companyData.company_size,
          status: 'target', notes: '', created_at: now, updated_at: now,
        })
      }
      leads.push(lead)
    })

    setPreview({ accounts: [...accountMap.values()], leads })
    setStep('preview')
  }

  function handleConfirmImport() {
    onImport(preview.accounts, preview.leads)
    setStep('done')
  }

  const hasCompanyMapping = Object.values(fieldMap).includes('company')
  const hasNameMapping = Object.values(fieldMap).includes('full_name') || (Object.values(fieldMap).includes('first_name') && Object.values(fieldMap).includes('last_name'))

  return (
    <div style={overlayStyle} onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 700, padding: 28, maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 18 }}>Import CSV</div>
            <div style={{ fontSize: 13, color: '#64748b' }}>Import leads and auto-create accounts from a CSV file</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#94a3b8' }}>x</button>
        </div>

        {/* Step indicator */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
          {['Upload', 'Map Fields', 'Preview & Confirm'].map((label, i) => {
            const stepIdx = ['upload', 'mapping', 'preview'].indexOf(step)
            const isActive = i === stepIdx
            const isDone = i < stepIdx || step === 'done'
            return (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{
                  width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 600,
                  background: isDone ? '#22c55e' : isActive ? '#6366f1' : '#e2e8f0',
                  color: isDone || isActive ? '#fff' : '#94a3b8',
                }}>{isDone ? '✓' : i + 1}</div>
                <span style={{ fontSize: 13, fontWeight: isActive ? 600 : 400, color: isActive ? '#1e293b' : '#94a3b8' }}>{label}</span>
                {i < 2 && <span style={{ color: '#e2e8f0', margin: '0 4px' }}>→</span>}
              </div>
            )
          })}
        </div>

        {/* Step 1: Upload */}
        {step === 'upload' && (
          <div>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFileSelect(e.dataTransfer.files[0]) }}
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: '2px dashed ' + (dragOver ? '#6366f1' : '#e2e8f0'),
                borderRadius: 12, padding: 48, textAlign: 'center', cursor: 'pointer',
                background: dragOver ? '#f5f3ff' : '#fafafa', transition: 'all 0.2s',
              }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>+</div>
              <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 8 }}>Drop your CSV file here</div>
              <div style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>or click to browse</div>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>Supports: Apollo exports, LinkedIn Sales Nav, or any CSV with contact data</div>
              <input ref={fileInputRef} type="file" accept=".csv,.txt" style={{ display: 'none' }}
                onChange={(e) => handleFileSelect(e.target.files[0])} />
            </div>
            <div style={{ marginTop: 16, padding: 16, background: '#f8fafc', borderRadius: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Expected columns:</div>
              <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.6 }}>
                <strong>Required:</strong> company, full_name (or first_name + last_name)<br/>
                <strong>Optional:</strong> email, title, linkedin_url, phone, country, industry, source
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Field Mapping */}
        {step === 'mapping' && (
          <div>
            <div style={{ marginBottom: 16, padding: 12, background: '#f0fdf4', borderRadius: 8, fontSize: 13, color: '#16a34a' }}>
              Found <strong>{parsed.rows.length}</strong> rows with <strong>{parsed.headers.length}</strong> columns
            </div>
            <div style={{ marginBottom: 16, fontSize: 13, color: '#64748b' }}>
              Map your CSV columns to the correct fields. Auto-detected mappings are pre-filled.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '8px 12px', alignItems: 'center', marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase' }}>CSV Column</div>
              <div></div>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase' }}>Maps To</div>
              {parsed.headers.map(h => {
                const sampleVal = parsed.rows[0]?.[h] || '—'
                return [
                  <div key={h + '_label'} style={{ fontSize: 13, fontWeight: 500, padding: '6px 10px', background: '#f8fafc', borderRadius: 6, fontFamily: 'monospace' }}>
                    {h}
                    <div style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'sans-serif', marginTop: 2 }}>
                      e.g. &quot;{sampleVal.length > 30 ? sampleVal.slice(0, 30) + '...' : sampleVal}&quot;
                    </div>
                  </div>,
                  <span key={h + '_arrow'} style={{ color: '#94a3b8' }}>→</span>,
                  <select key={h + '_select'}
                    value={fieldMap[h] || ''}
                    onChange={(e) => setFieldMap(f => ({ ...f, [h]: e.target.value }))}
                    style={{ padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, background: fieldMap[h] ? '#f0fdf4' : '#fff' }}>
                    {OUR_FIELDS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
                  </select>,
                ]
              })}
            </div>
            {!hasCompanyMapping && (
              <div style={{ padding: 10, background: '#fffbeb', borderRadius: 6, fontSize: 12, color: '#b45309', marginBottom: 12 }}>
                No &quot;Company&quot; column mapped — accounts won&apos;t be auto-created
              </div>
            )}
            {!hasNameMapping && (
              <div style={{ padding: 10, background: '#fffbeb', borderRadius: 6, fontSize: 12, color: '#b45309', marginBottom: 12 }}>
                No name column mapped — leads need at least a name
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <button onClick={() => setStep('upload')} style={btnSecondary}>Back</button>
              <button onClick={generatePreview} style={btnPrimary} disabled={!hasNameMapping && !hasCompanyMapping}>
                Preview Import
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Preview */}
        {step === 'preview' && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
              <div style={{ padding: 16, background: '#f5f3ff', borderRadius: 8, textAlign: 'center' }}>
                <div style={{ fontSize: 28, fontWeight: 700, color: '#6366f1' }}>{preview.accounts.length}</div>
                <div style={{ fontSize: 13, color: '#64748b' }}>New accounts to create</div>
              </div>
              <div style={{ padding: 16, background: '#eff6ff', borderRadius: 8, textAlign: 'center' }}>
                <div style={{ fontSize: 28, fontWeight: 700, color: '#3b82f6' }}>{preview.leads.length}</div>
                <div style={{ fontSize: 13, color: '#64748b' }}>Leads to import</div>
              </div>
            </div>
            {preview.accounts.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>New Accounts</div>
                <div style={{ maxHeight: 150, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 8 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: '#f8fafc' }}>
                        <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 600 }}>Company</th>
                        <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 600 }}>Country</th>
                        <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 600 }}>Industry</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.accounts.map(a => (
                        <tr key={a.id} style={{ borderTop: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '6px 10px' }}>{a.name}</td>
                          <td style={{ padding: '6px 10px', color: '#64748b' }}>{a.country || '—'}</td>
                          <td style={{ padding: '6px 10px', color: '#64748b' }}>{a.industry || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Leads Preview (first 10)</div>
              <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 8 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: '#f8fafc' }}>
                      <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 600 }}>Name</th>
                      <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 600 }}>Company</th>
                      <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 600 }}>Title</th>
                      <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 600 }}>Email</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.leads.slice(0, 10).map(l => (
                      <tr key={l.id} style={{ borderTop: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '6px 10px' }}>{l.full_name || '—'}</td>
                        <td style={{ padding: '6px 10px', color: '#64748b' }}>{l.company || '—'}</td>
                        <td style={{ padding: '6px 10px', color: '#64748b' }}>{l.title || '—'}</td>
                        <td style={{ padding: '6px 10px', color: '#64748b' }}>{l.email || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {preview.leads.length > 10 && (
                <div style={{ fontSize: 12, color: '#94a3b8', textAlign: 'center', marginTop: 6 }}>
                  ...and {preview.leads.length - 10} more leads
                </div>
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <button onClick={() => setStep('mapping')} style={btnSecondary}>Back</button>
              <button onClick={handleConfirmImport}
                style={{ ...btnPrimary, background: '#22c55e', padding: '10px 24px', fontSize: 15 }}>
                Import {preview.leads.length} Leads + {preview.accounts.length} Accounts
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Done */}
        {step === 'done' && (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>&#10003;</div>
            <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 8 }}>Import Complete!</div>
            <div style={{ fontSize: 14, color: '#64748b', marginBottom: 24 }}>
              Created {preview.accounts.length} accounts and {preview.leads.length} leads
            </div>
            <button onClick={onClose} style={{ ...btnPrimary, padding: '10px 32px' }}>Done</button>
          </div>
        )}
      </div>
    </div>
  )
}

// ---- Analytics Tab ----

function getWeekStart(date) {
  const d = new Date(date)
  const day = d.getDay()
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1)) // Monday
  d.setHours(0, 0, 0, 0)
  return d
}

function getWeekEnd(start) {
  const d = new Date(start)
  d.setDate(d.getDate() + 6)
  d.setHours(23, 59, 59, 999)
  return d
}

function getMonthStart(date) {
  const d = new Date(date)
  d.setDate(1)
  d.setHours(0, 0, 0, 0)
  return d
}

function getMonthEnd(start) {
  const d = new Date(start)
  d.setMonth(d.getMonth() + 1)
  d.setDate(0)
  d.setHours(23, 59, 59, 999)
  return d
}

function getPeriods(view) {
  const now = new Date()
  const periods = []
  if (view === 'daily') {
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now)
      d.setDate(d.getDate() - i)
      d.setHours(0, 0, 0, 0)
      const end = new Date(d)
      end.setHours(23, 59, 59, 999)
      periods.push({ start: d, end, label: d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) })
    }
  } else if (view === 'weekly') {
    for (let i = 25; i >= 0; i--) {
      const ref = new Date(now)
      ref.setDate(ref.getDate() - i * 7)
      const start = getWeekStart(ref)
      const end = getWeekEnd(start)
      const label = `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
      periods.push({ start, end, label })
    }
  } else {
    for (let i = 11; i >= 0; i--) {
      const ref = new Date(now)
      ref.setMonth(ref.getMonth() - i)
      const start = getMonthStart(ref)
      const end = getMonthEnd(start)
      periods.push({ start, end, label: start.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) })
    }
  }
  return periods
}

// Stages in order for funnel calculation
const LEAD_FUNNEL_STAGES = ['new', 'researching', 'engaging', 'nurturing', 'qualified', 'converted']

// Activity types that count as a real first-touch message (not connection req, not warm-up)
const MESSAGE_OUTBOUND_TYPES = ['dm_sent', 'inmail_sent', 'email_sent', 'whatsapp_sent', 'call_made']
// Activity types that count as a real inbound response (connection_accepted is passive, excluded)
const RESPONSE_INBOUND_TYPES = ['dm_received', 'inmail_received', 'email_received', 'whatsapp_received', 'call_received']

function leadActs(lead) { return lead.activities || [] }
function leadHasType(lead, type) { return leadActs(lead).some(a => a.type === type) }
function leadHasAnyType(lead, types) { return leadActs(lead).some(a => types.includes(a.type)) }

// Date of the lead's first real outbound message (null if never messaged)
function firstMessageDate(lead) {
  const dates = leadActs(lead).filter(a => MESSAGE_OUTBOUND_TYPES.includes(a.type)).map(a => new Date(a.date)).sort((x, y) => x - y)
  return dates.length ? dates[0] : null
}

function calcPeriodStats(leads, accounts, deals, period) {
  const inPeriod = (dateStr) => { const d = new Date(dateStr); return d >= period.start && d <= period.end }

  // Cohort = leads created in this period
  const periodLeads = leads.filter(l => inPeriod(l.created_at))
  // Prospecting accounts only (no open deal + not a customer) created in this period
  const periodAccounts = accounts.filter(a => {
    if (!inPeriod(a.created_at)) return false
    const hasOpenDeal = (deals || []).some(d => d.account_id === a.id && d.deal_status === 'open')
    return !hasOpenDeal && a.status !== 'customer'
  })

  // First messages sent = leads whose FIRST real outbound message happened in this period
  // (productivity metric — counts the people you started messaging, regardless of when added)
  const firstMessages = leads.filter(l => {
    const fmd = firstMessageDate(l)
    return fmd && fmd >= period.start && fmd <= period.end
  }).length

  const total = periodLeads.length

  // ---- Conversion rates: activity-driven, measured over this period's cohort ----
  // Denominators are the relevant funnel step, so rates reflect REAL logged events.
  const connSent  = periodLeads.filter(l => leadHasType(l, 'connection_sent')).length
  const connAcc   = periodLeads.filter(l => leadHasType(l, 'connection_accepted')).length
  const msgSent   = periodLeads.filter(l => leadHasAnyType(l, MESSAGE_OUTBOUND_TYPES)).length
  const responded = periodLeads.filter(l => leadHasAnyType(l, RESPONSE_INBOUND_TYPES)).length
  const metWith   = periodLeads.filter(l => leadHasType(l, 'meeting_held')).length
  const qualified = periodLeads.filter(l => ['qualified', 'converted'].includes(l.stage)).length
  const converted = periodLeads.filter(l => l.stage === 'converted').length

  const pct = (num, den) => den > 0 ? Math.round((num / den) * 100) : null

  return {
    total,
    accounts: periodAccounts.length,
    firstMessages,
    // raw counts (for tooltips / context)
    connSent, connAcc, msgSent, responded, metWith,
    // rates (null when denominator is 0 → shown as —)
    acceptance: pct(connAcc, connSent),
    response: pct(responded, msgSent),
    meeting: pct(metWith, responded),
    qualified: total > 0 ? Math.round((qualified / total) * 100) : null,
    converted: total > 0 ? Math.round((converted / total) * 100) : null,
  }
}

function AnalyticsTab({ leads, accounts, deals, settings, onUpdateSettings }) {
  const [view, setView] = useState('weekly')
  const [showGoals, setShowGoals] = useState(false)
  const [goals, setGoals] = useState({
    leads_per_week: settings.goal_leads_per_week || 20,
    messages_per_week: settings.goal_messages_per_week || 15,
    accounts_per_week: settings.goal_accounts_per_week || 5,
    acceptance_rate: settings.goal_acceptance_rate || 30,
    response_rate: settings.goal_response_rate || 15,
    meeting_rate: settings.goal_meeting_rate || 10,
  })

  const allPeriods = getPeriods(view).map(p => ({ ...p, stats: calcPeriodStats(leads, accounts, deals, p) }))

  // Hide leading empty periods — only show from the first period with activity onward.
  // Current period (last) is always kept even if empty.
  const hasActivity = (p) => p.stats.total > 0 || p.stats.accounts > 0 || p.stats.firstMessages > 0
  const firstActiveIdx = allPeriods.findIndex(hasActivity)
  const periodStats = firstActiveIdx === -1
    ? allPeriods.slice(-1)
    : allPeriods.slice(firstActiveIdx)

  // Current period (last one)
  const current = periodStats[periodStats.length - 1]
  const previous = periodStats.length > 1 ? periodStats[periodStats.length - 2] : null

  function saveGoals() {
    onUpdateSettings({
      goal_leads_per_week: goals.leads_per_week,
      goal_messages_per_week: goals.messages_per_week,
      goal_accounts_per_week: goals.accounts_per_week,
      goal_acceptance_rate: goals.acceptance_rate,
      goal_response_rate: goals.response_rate,
      goal_meeting_rate: goals.meeting_rate,
    })
    setShowGoals(false)
  }

  function GoalProgress({ label, value, goal, suffix = '' }) {
    const pct = goal > 0 ? Math.min(100, Math.round((value / goal) * 100)) : 0
    const color = pct >= 100 ? '#22c55e' : pct >= 50 ? '#f59e0b' : '#ef4444'
    return (
      <div style={{ ...cardStyle, padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontSize: 12, color: '#64748b' }}>{label}</span>
          <span style={{ fontSize: 12, fontWeight: 600, color }}>{value}{suffix} / {goal}{suffix}</span>
        </div>
        <div style={{ height: 8, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 4, transition: 'width 0.3s' }} />
        </div>
        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4, textAlign: 'right' }}>{pct}%</div>
      </div>
    )
  }

  function RateCard({ label, value, prev, icon, sub }) {
    const diff = (value != null && prev != null) ? value - prev : null
    return (
      <div style={{ ...cardStyle, padding: 16, textAlign: 'center' }}>
        <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>{icon} {label}</div>
        <div style={{ fontSize: 28, fontWeight: 700, color: value == null ? '#cbd5e1' : '#1e293b' }}>
          {value == null ? '—' : value + '%'}
        </div>
        {sub && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{sub}</div>}
        {diff != null && diff !== 0 && (
          <div style={{ fontSize: 12, color: diff > 0 ? '#22c55e' : '#ef4444', marginTop: 2 }}>
            {diff > 0 ? '+' : ''}{diff}% vs prev
          </div>
        )}
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 20, color: '#1e293b' }}>Prospecting Analytics</div>
          <div style={{ fontSize: 13, color: '#64748b' }}>Track your outreach consistency and conversion rates</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setShowGoals(true)} style={{ ...btnSecondary, fontSize: 13 }}>Goals</button>
          <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: 6, padding: 2 }}>
            {['daily', 'weekly', 'monthly'].map(v => (
              <button key={v} onClick={() => setView(v)} style={{
                padding: '6px 14px', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12, fontWeight: 600,
                background: view === v ? '#fff' : 'transparent', color: view === v ? '#6366f1' : '#64748b',
                boxShadow: view === v ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              }}>{v.charAt(0).toUpperCase() + v.slice(1)}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Goals progress (current period) */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b', marginBottom: 12 }}>
          Current Period: {current.label}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          <GoalProgress label="Leads Added" value={current.stats.total} goal={view === 'daily' ? Math.ceil(goals.leads_per_week / 5) : view === 'weekly' ? goals.leads_per_week : goals.leads_per_week * 4} />
          <GoalProgress label="First Messages Sent" value={current.stats.firstMessages} goal={view === 'daily' ? Math.ceil(goals.messages_per_week / 5) : view === 'weekly' ? goals.messages_per_week : goals.messages_per_week * 4} />
          <GoalProgress label="Accounts Added" value={current.stats.accounts} goal={view === 'daily' ? Math.ceil(goals.accounts_per_week / 5) : view === 'weekly' ? goals.accounts_per_week : goals.accounts_per_week * 4} />
        </div>
      </div>

      {/* Conversion funnel rates */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b', marginBottom: 4 }}>Conversion Rates (leads sourced in this period)</div>
        <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 12 }}>Based on activities you log. Shows "—" until there's data at that step.</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
          <RateCard label="Acceptance" value={current.stats.acceptance} prev={previous?.stats.acceptance} icon="" sub={`${current.stats.connAcc}/${current.stats.connSent} accepted`} />
          <RateCard label="Response" value={current.stats.response} prev={previous?.stats.response} icon="" sub={`${current.stats.responded}/${current.stats.msgSent} replied`} />
          <RateCard label="Meeting" value={current.stats.meeting} prev={previous?.stats.meeting} icon="" sub={`${current.stats.metWith} held`} />
          <RateCard label="Qualified" value={current.stats.qualified} prev={previous?.stats.qualified} icon="" />
          <RateCard label="Converted" value={current.stats.converted} prev={previous?.stats.converted} icon="" />
        </div>
      </div>

      {/* Timeline table */}
      <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0' }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>Activity Over Time</div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, whiteSpace: 'nowrap' }}>Period</th>
                <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600 }}>Leads</th>
                <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600 }}>Messages</th>
                <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600 }}>Accounts</th>
                <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600 }}>Acceptance</th>
                <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600 }}>Response</th>
                <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600 }}>Meeting</th>
                <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600 }}>Qualified</th>
                <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600 }}>Converted</th>
              </tr>
            </thead>
            <tbody>
              {periodStats.map((p, i) => {
                const s = p.stats
                const isLast = i === periodStats.length - 1
                return (
                  <tr key={p.label} style={{ borderTop: '1px solid #f1f5f9', background: isLast ? '#fefce8' : undefined }}>
                    <td style={{ padding: '10px 16px', fontWeight: isLast ? 600 : 400, whiteSpace: 'nowrap' }}>
                      {p.label} {isLast && <span style={{ fontSize: 10, color: '#f59e0b', fontWeight: 600 }}>CURRENT</span>}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600 }}>{s.total}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600, color: s.firstMessages > 0 ? '#6366f1' : '#cbd5e1' }}>{s.firstMessages}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>{s.accounts}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'center', color: s.acceptance != null ? '#1e293b' : '#cbd5e1' }}>{s.acceptance != null ? s.acceptance + '%' : '—'}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'center', color: s.response != null ? '#1e293b' : '#cbd5e1' }}>{s.response != null ? s.response + '%' : '—'}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'center', color: s.meeting != null ? '#1e293b' : '#cbd5e1' }}>{s.meeting != null ? s.meeting + '%' : '—'}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'center', color: s.qualified != null ? '#1e293b' : '#cbd5e1' }}>{s.qualified != null ? s.qualified + '%' : '—'}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'center', color: s.converted != null ? '#1e293b' : '#cbd5e1' }}>{s.converted != null ? s.converted + '%' : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Visual bar chart */}
      <div style={{ ...cardStyle, marginTop: 16, padding: 20 }}>
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 16 }}>Leads Added Per Period</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 120 }}>
          {periodStats.map((p, i) => {
            const max = Math.max(...periodStats.map(pp => pp.stats.total), 1)
            const h = Math.max(4, (p.stats.total / max) * 100)
            const isLast = i === periodStats.length - 1
            const goalLine = view === 'daily' ? Math.ceil(goals.leads_per_week / 5) : view === 'weekly' ? goals.leads_per_week : goals.leads_per_week * 4
            return (
              <div key={p.label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: p.stats.total >= goalLine ? '#22c55e' : '#64748b' }}>
                  {p.stats.total}
                </div>
                <div style={{
                  width: '100%', maxWidth: 40, height: h, borderRadius: '4px 4px 0 0',
                  background: isLast ? '#6366f1' : p.stats.total >= goalLine ? '#22c55e' : '#cbd5e1',
                  transition: 'height 0.3s',
                }} />
                <div style={{ fontSize: 9, color: '#94a3b8', textAlign: 'center', lineHeight: 1.2 }}>
                  {view === 'daily' ? p.label.split(',')[0] : view === 'weekly' ? p.label.split(' - ')[0] : p.label.split(' ')[0]}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Goals modal */}
      {showGoals && (
        <div style={overlayStyle} onClick={e => { if (e.target === e.currentTarget) setShowGoals(false) }}>
          <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 420, padding: 28 }}>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Weekly Goals</div>
            <div style={{ fontSize: 13, color: '#64748b', marginBottom: 20 }}>Set your weekly prospecting targets</div>
            {[
              { key: 'leads_per_week', label: 'Leads per week', type: 'number' },
              { key: 'messages_per_week', label: 'First messages sent per week', type: 'number' },
              { key: 'accounts_per_week', label: 'Accounts per week', type: 'number' },
              { key: 'acceptance_rate', label: 'Target acceptance rate (%)', type: 'number' },
              { key: 'response_rate', label: 'Target response rate (%)', type: 'number' },
              { key: 'meeting_rate', label: 'Target meeting rate (%)', type: 'number' },
            ].map(g => (
              <div key={g.key} style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#64748b', marginBottom: 4 }}>{g.label}</label>
                <input type={g.type} value={goals[g.key]}
                  onChange={e => setGoals(prev => ({ ...prev, [g.key]: Number(e.target.value) || 0 }))}
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13 }} />
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
              <button onClick={() => setShowGoals(false)} style={btnSecondary}>Cancel</button>
              <button onClick={saveGoals} style={btnPrimary}>Save Goals</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
