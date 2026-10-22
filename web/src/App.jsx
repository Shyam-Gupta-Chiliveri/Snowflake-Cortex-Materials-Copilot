import React, { useEffect, useState } from 'react'
import { get, viewFromHash } from './lib.js'
import Overview from './views/Overview.jsx'
import Chat from './views/Chat.jsx'
import Groups from './views/Groups.jsx'
import Sem from './views/Sem.jsx'
import Anomalies from './views/Anomalies.jsx'
import ServiceNow from './views/ServiceNow.jsx'

const VIEWS = {
  overview: ['Workbench', 'Overview', Overview],
  chat: ['Cortex', 'Ask the materials copilot', Chat],
  groups: ['Quality', 'Heat-treatment group comparison', Groups],
  sem: ['Quality', 'SEM fractography (U-Net ductile / brittle)', Sem],
  anomalies: ['Quality', 'Nonconformances and failing routes', Anomalies],
  servicenow: ['ITSM', 'ServiceNow incident preview', ServiceNow],
}

const ICONS = {
  overview: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  chat: 'M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z',
  groups: 'M4 19V5M4 19h16M8 15v-4M12 15V8M16 15v-6',
  sem: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  anomalies: 'M12 9v4M12 17h.01M10.3 3.3L1.8 18a2 2 0 0 0 1.7 3h16.9a2 2 0 0 0 1.7-3L13.7 3.3a2 2 0 0 0-3.4 0z',
  servicenow: 'M4 4h16v4H4zM4 10h16v10H4zM8 14h8',
}

export default function App() {
  const [view, setView] = useState(viewFromHash)
  const [health, setHealth] = useState(null)
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || 'dark')
  const [menu, setMenu] = useState(false)

  useEffect(() => {
    const onHash = () => { setView(viewFromHash()); setMenu(false) }
    window.addEventListener('hashchange', onHash)
    get('/health').then(setHealth).catch(() => setHealth({ ok: false, mode: 'down' }))
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const applyTheme = (t) => {
    document.documentElement.dataset.theme = t
    localStorage.setItem('wb-theme', t)
    setTheme(t)
  }

  const [crumb, title, View] = VIEWS[view] || VIEWS.overview
  const live = health?.mode === 'snowflake'

  return (
    <div className="app">
      <aside className={`side${menu ? ' open' : ''}`}>
        <div className="brand">
          <div className="mark"><span>4C</span></div>
          <div><b>Materials Copilot</b><small>Snowflake Cortex · 4Cr13</small></div>
        </div>
        <nav className="nav">
          <div className="group">Start</div>
          <Nav href="#/overview" id="overview" view={view} label="Overview" />
          <div className="group">Quality</div>
          <Nav href="#/chat" id="chat" view={view} label="Cortex chat" live />
          <Nav href="#/groups" id="groups" view={view} label="Group comparison" />
          <Nav href="#/sem" id="sem" view={view} label="SEM fractography" />
          <Nav href="#/anomalies" id="anomalies" view={view} label="Anomalies & 8D" />
          <div className="group">ITSM</div>
          <Nav href="#/servicenow" id="servicenow" view={view} label="ServiceNow preview" />
        </nav>
        <div className="foot">
          <div className="row"><span>{health ? (live ? `Cortex · ${health.cortex}` : `Local mirror · Cortex mocked`) : 'Connecting…'}</span></div>
          <div className="row">
            <button className="toggle" type="button" onClick={() => applyTheme(theme === 'dark' ? 'light' : 'dark')}>
              {theme === 'dark' ? 'Light theme' : 'Dark theme'}
            </button>
            <a href="https://github.com/Shyam-Gupta-Chiliveri/Snowflake-Cortex-Materials-Copilot" target="_blank" rel="noreferrer">GitHub</a>
          </div>
        </div>
      </aside>
      <div className="main">
        <header className="top">
          <button className="toggle menu-btn" type="button" onClick={() => setMenu((m) => !m)}>Menu</button>
          <div>
            <div className="crumb">{crumb}</div>
            <h1>{title}</h1>
          </div>
          <div className="spacer" />
          <span className={`live${live ? '' : ' warn'}`}>
            <i />
            {live ? 'Live on Snowflake' : 'Local mirror · Cortex mocked'}
          </span>
        </header>
        <section className="view">
          <View health={health} />
        </section>
      </div>
    </div>
  )
}

function Nav({ href, id, view, label, live }) {
  return (
    <a href={href} className={view === id ? 'active' : ''}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d={ICONS[id]} /></svg>
      {label}
      {live ? <span className="chip pos" style={{ marginLeft: 'auto' }}>Live</span> : null}
    </a>
  )
}
