import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import * as d3 from 'd3'
import ARTICLES from './articles.json'
import TICKERS from './tickers.json'

const THEMES = [
  { label:"Securities Fraud",       color:"#C04A1E", bg:"#FDF0EB", icon:"⚖️" },
  { label:"Insider Trading",        color:"#9A6010", bg:"#FDF5E6", icon:"🤫" },
  { label:"Musk / Tesla / SpaceX",  color:"#1455A0", bg:"#EAF3FC", icon:"🚀" },
  { label:"M&A / Mergers",          color:"#0D6048", bg:"#E8F7F2", icon:"🤝" },
  { label:"Crypto / Blockchain",    color:"#4840A0", bg:"#EEEDF8", icon:"₿" },
  { label:"OpenAI / AI",            color:"#882E50", bg:"#FAE9F0", icon:"🤖" },
  { label:"Fed / Central Banks",    color:"#336010", bg:"#EBF5DE", icon:"🏦" },
  { label:"IPOs / Capital Markets", color:"#1A5FA0", bg:"#EAF3FC", icon:"📈" },
  { label:"Legal / Courts",         color:"#505048", bg:"#F2F2EE", icon:"👨‍⚖️" },
  { label:"Hedge Funds / PE",       color:"#882818", bg:"#FDF0EB", icon:"💰" },
  { label:"Regulation / SEC",       color:"#784810", bg:"#FDF5E6", icon:"📋" },
  { label:"Banking / Crises",       color:"#902828", bg:"#FBECEC", icon:"🏧" },
  { label:"Corporate Governance",   color:"#1A8060", bg:"#E8F7F2", icon:"🏢" },
  { label:"Options / Derivatives",  color:"#6058B0", bg:"#EEEDF8", icon:"📊" },
]
const TM = Object.fromEntries(THEMES.map(t => [t.label, t]))

function ThemePill({ theme, small, onClick }) {
  const t = TM[theme]; if (!t) return null
  return (
    <span onClick={onClick} style={{
      display:'inline-block', fontSize:small?10:11, padding:small?'1px 6px':'2px 9px',
      borderRadius:20, background:t.bg, color:t.color, fontWeight:500,
      whiteSpace:'nowrap', cursor:onClick?'pointer':'default', lineHeight:1.6
    }}>{theme}</span>
  )
}

function ReturnBadge({ pct }) {
  if (pct == null) return null
  const pos = pct >= 0
  return <span style={{fontSize:11,fontWeight:600,padding:'1px 7px',borderRadius:4,background:pos?'#EBF5DE':'#FBECEC',color:pos?'#336010':'#902828'}}>{pos?'+':''}{pct.toFixed(0)}%</span>
}

// ── Bubble Chart ─────────────────────────────────────────────────────────────
function BubbleChart({ selected, onSelect }) {
  const ref = useRef()
  const counts = useMemo(() => {
    const c = Object.fromEntries(THEMES.map(t => [t.label, 0]))
    ARTICLES.forEach(a => (a.themes||[]).forEach(th => { if (c[th]!==undefined) c[th]++ }))
    return c
  }, [])

  useEffect(() => {
    const el = ref.current; if (!el) return
    const W = el.clientWidth || 700, H = 300
    d3.select(el).selectAll('*').remove()
    const data = THEMES.map(t => ({ ...t, count: counts[t.label]||0 }))
    const pack = d3.pack().size([W,H]).padding(8)
    const root = d3.hierarchy({ children: data }).sum(d => Math.max(d.count,2)+10)
    pack(root)
    const svg = d3.select(el).attr('viewBox',`0 0 ${W} ${H}`).attr('width','100%').attr('height',H)
    const node = svg.selectAll('g').data(root.leaves()).enter().append('g')
      .attr('transform', d=>`translate(${d.x},${d.y})`).style('cursor','pointer')
      .on('click', (_,d) => onSelect(selected===d.data.label?null:d.data.label))
    node.append('circle').attr('r',d=>d.r)
      .attr('fill',d=>d.data.bg).attr('stroke',d=>d.data.color)
      .attr('stroke-width',d=>selected===d.data.label?2.5:1)
      .attr('opacity',d=>selected&&selected!==d.data.label?0.3:1)
    node.append('text').attr('text-anchor','middle').attr('dy',d=>d.r>32?'-0.25em':'0.35em')
      .attr('font-size',d=>Math.min(d.r*0.27,12)).attr('fill',d=>d.data.color).attr('font-weight','500')
      .attr('font-family','Inter, sans-serif')
      .text(d=>{ const l=d.data.label,r=d.r; if(r<20)return''; if(r<32)return l.split(' ')[0]; return l.length>15?l.slice(0,14)+'…':l })
    node.filter(d=>d.r>30).append('text').attr('text-anchor','middle').attr('dy','1.1em')
      .attr('font-size',d=>Math.min(d.r*0.22,11)).attr('fill',d=>d.data.color).attr('opacity',0.7)
      .attr('font-family','Inter, sans-serif').text(d=>d.data.count)
  }, [selected])

  return <svg ref={ref} style={{width:'100%',height:300,display:'block'}} />
}

// ── Article Row ──────────────────────────────────────────────────────────────
function ArticleRow({ a, expanded, onClick }) {
  const t = TM[a.themes?.[0]]
  return (
    <div onClick={onClick} style={{
      padding:'10px 0', borderBottom:'1px solid #EEEEE8',
      cursor:'pointer', transition:'background 0.1s',
      borderLeft: expanded ? `3px solid ${t?.color||'#999'}` : '3px solid transparent',
      paddingLeft: expanded ? 10 : 0,
      background: expanded ? '#FAFAF4' : 'transparent',
    }}
    onMouseEnter={e=>{ if(!expanded) e.currentTarget.style.background='#F7F7F2' }}
    onMouseLeave={e=>{ if(!expanded) e.currentTarget.style.background='transparent' }}>
      <div style={{display:'flex',gap:10,alignItems:'flex-start'}}>
        <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:10,color:'#999',whiteSpace:'nowrap',paddingTop:2,width:72,flexShrink:0}}>{a.d}</span>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:13,fontWeight:500,lineHeight:1.4,marginBottom:4,color:'#1a1a18'}}>{a.t}</div>
          <div style={{display:'flex',gap:4,flexWrap:'wrap',alignItems:'center'}}>
            {(a.themes||[]).map(th=><ThemePill key={th} theme={th} small />)}
          </div>
          {expanded && a.lesson && (
            <div style={{marginTop:10,padding:'10px 14px',background:'#fff',border:'1px solid #EEEEE8',borderLeft:`3px solid ${t?.color||'#ccc'}`,borderRadius:'0 8px 8px 0'}}>
              <div style={{fontSize:10,fontWeight:600,color:t?.color||'#666',textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:4}}>Key lesson</div>
              <div style={{fontSize:13,lineHeight:1.7,fontStyle:'italic',color:'#333'}}>"{a.lesson}"</div>
              {a.summary && a.summary !== a.lesson && (
                <div style={{fontSize:12,color:'#666',lineHeight:1.6,marginTop:8}}>{a.summary}</div>
              )}
            </div>
          )}
          {expanded && (
            <div style={{marginTop:8}}>
              <a href={a.u} target="_blank" rel="noreferrer" style={{fontSize:11,color:'#1455A0',textDecoration:'none'}}>Read full issue ↗</a>
            </div>
          )}
        </div>
        <span style={{fontSize:10,color:'#aaa',whiteSpace:'nowrap',flexShrink:0}}>{Math.round(a.w/200)}m</span>
      </div>
    </div>
  )
}

// ── Flashcards ───────────────────────────────────────────────────────────────
function Flashcards({ themeFilter, onBack }) {
  const deck = useMemo(() => ARTICLES.filter(a => {
    if (!a.lesson || a.lesson.length < 30) return false
    if (themeFilter && !a.themes?.includes(themeFilter)) return false
    return true
  }), [themeFilter])

  const [idx, setIdx] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const cur = deck[idx % Math.max(deck.length,1)]

  if (!deck.length) return (
    <div style={{textAlign:'center',padding:'4rem',color:'#888'}}>
      <p style={{marginBottom:16}}>No lessons for {themeFilter||'this filter'}.</p>
      <button onClick={onBack}>← Back</button>
    </div>
  )

  const next = () => { setIdx(i=>(i+1)%deck.length); setFlipped(false) }
  const prev = () => { setIdx(i=>(i-1+deck.length)%deck.length); setFlipped(false) }
  const t = TM[cur.themes?.[0]]

  return (
    <div style={{maxWidth:560,margin:'0 auto',padding:'0.5rem 0 2rem'}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'1.5rem'}}>
        <button onClick={onBack} style={{fontSize:12,color:'#666',border:'none',background:'none',padding:0}}>← Archive</button>
        <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:11,color:'#aaa'}}>{idx%deck.length+1}/{deck.length}{themeFilter?` · ${themeFilter}`:''}</span>
        <div style={{display:'flex',gap:6}}>
          <button onClick={prev}>←</button>
          <button onClick={next}>→</button>
        </div>
      </div>
      <div style={{background:'#fff',borderRadius:12,padding:'2rem',minHeight:280,display:'flex',flexDirection:'column',justifyContent:'center',border:'1px solid #EEEEE8',boxShadow:'0 2px 12px rgba(0,0,0,0.05)'}}>
        <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:10,color:'#aaa',marginBottom:12}}>{cur.d}</div>
        <div style={{fontFamily:"'Playfair Display',serif",fontSize:18,fontWeight:500,lineHeight:1.5,color:'#1a1a18',marginBottom:'1.25rem'}}>{cur.t}</div>
        <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:'1.25rem'}}>
          {(cur.themes||[]).map(th=><ThemePill key={th} theme={th}/>)}
        </div>
        {!flipped
          ? <button onClick={()=>setFlipped(true)} style={{alignSelf:'flex-start',padding:'9px 18px',background:'#1a1a18',color:'#fff',border:'none',borderRadius:8,fontSize:13,cursor:'pointer'}}>Reveal lesson</button>
          : <div>
              <div style={{fontSize:10,fontWeight:600,color:t?.color||'#888',textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:6}}>Matt's lesson</div>
              <div style={{fontSize:14,lineHeight:1.8,fontStyle:'italic',borderLeft:`3px solid ${t?.color||'#ccc'}`,paddingLeft:14,marginBottom:12,color:'#222'}}>"{cur.lesson}"</div>
              {cur.summary && cur.summary!==cur.lesson && <div style={{fontSize:12,color:'#666',lineHeight:1.6,marginBottom:12}}>{cur.summary}</div>}
              <a href={cur.u} target="_blank" rel="noreferrer" style={{fontSize:11,color:'#1455A0',textDecoration:'none'}}>Read full ↗</a>
            </div>
        }
      </div>
      <div style={{display:'flex',justifyContent:'center',gap:3,marginTop:14,flexWrap:'wrap'}}>
        {[...Array(Math.min(deck.length,30))].map((_,i)=>(
          <div key={i} onClick={()=>{setIdx(i);setFlipped(false)}} style={{width:6,height:6,borderRadius:3,background:i===(idx%deck.length)?'#1a1a18':'#ddd',cursor:'pointer'}} />
        ))}
        {deck.length>30&&<span style={{fontSize:10,color:'#aaa',marginLeft:4}}>+{deck.length-30}</span>}
      </div>
    </div>
  )
}

// ── Ticker Row ───────────────────────────────────────────────────────────────
function TickerCard({ t }) {
  const [open, setOpen] = useState(false)
  const pos = t.return_pct >= 0
  return (
    <div style={{background:'#fff',border:'1px solid #EEEEE8',borderRadius:10,padding:'12px 16px',marginBottom:8}}>
      <div style={{display:'flex',alignItems:'center',gap:12,cursor:'pointer'}} onClick={()=>setOpen(o=>!o)}>
        <div style={{width:48,height:48,borderRadius:8,background:pos?'#EBF5DE':'#FBECEC',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
          <span style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:600,fontSize:13,color:pos?'#336010':'#902828'}}>{t.ticker}</span>
        </div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:12,color:'#666'}}>First mentioned <strong style={{color:'#333'}}>{t.first_date}</strong> · {t.mention_count}× in archive</div>
          <div style={{fontSize:11,color:'#aaa',marginTop:2}}>{t.mentions?.[0]?.t?.slice(0,55)}…</div>
        </div>
        <div style={{textAlign:'right',flexShrink:0}}>
          <div style={{fontSize:11,color:'#888',marginBottom:2}}>${t.price_then} → <strong style={{color:'#333'}}>${t.price_now}</strong></div>
          <ReturnBadge pct={t.return_pct} />
        </div>
        <span style={{fontSize:11,color:'#ccc',marginLeft:4}}>{open?'▲':'▼'}</span>
      </div>
      {open && (
        <div style={{marginTop:10,paddingTop:10,borderTop:'1px solid #EEEEE8'}}>
          <div style={{fontSize:11,color:'#888',marginBottom:6}}>Articles mentioning {t.ticker}:</div>
          {(t.mentions||[]).map((m,i)=>(
            <div key={i} style={{fontSize:11,padding:'3px 0',color:'#555'}}>
              <span style={{fontFamily:"'JetBrains Mono',monospace",color:'#aaa',marginRight:8}}>{m.d}</span>
              {m.t}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState('themes')
  const [selectedTheme, setSelectedTheme] = useState(null)
  const [expandedId, setExpandedId] = useState(null)
  const [search, setSearch] = useState('')
  const [year, setYear] = useState('all')
  const [flashTheme, setFlashTheme] = useState(null)

  const years = useMemo(() => ['all', ...[...new Set(ARTICLES.map(a=>a.d?.slice(0,4)).filter(Boolean))].sort().reverse()], [])

  const filtered = useMemo(() => ARTICLES.filter(a => {
    if (year !== 'all' && !a.d?.startsWith(year)) return false
    if (search) {
      const q = search.toLowerCase()
      if (!a.t.toLowerCase().includes(q) && !a.lesson?.toLowerCase().includes(q)) return false
    }
    if (selectedTheme && !a.themes?.includes(selectedTheme)) return false
    return true
  }).slice(0, 400), [year, search, selectedTheme])

  const themeCounts = useMemo(() => {
    const c = Object.fromEntries(THEMES.map(t=>[t.label,0]))
    ARTICLES.forEach(a => (a.themes||[]).forEach(th=>{ if(c[th]!==undefined) c[th]++ }))
    return c
  }, [])

  if (tab === 'flashcard') return (
    <div style={{maxWidth:800,margin:'0 auto',padding:'1.5rem 1rem'}}>
      <Flashcards themeFilter={flashTheme} onBack={()=>setTab('themes')} />
    </div>
  )

  const navStyle = (t) => ({
    fontSize:13, padding:'7px 16px', fontWeight: tab===t?500:400,
    background: tab===t?'#1a1a18':'transparent',
    color: tab===t?'#fff':'#555',
    border: tab===t?'1px solid #1a1a18':'1px solid #ddd',
    borderRadius:6
  })

  return (
    <div style={{minHeight:'100vh',background:'#FAFAF8'}}>
      {/* Header */}
      <div style={{borderBottom:'1px solid #EAEAE4',background:'#fff',position:'sticky',top:0,zIndex:100}}>
        <div style={{maxWidth:1000,margin:'0 auto',padding:'0 1rem',display:'flex',alignItems:'center',justifyContent:'space-between',height:56,gap:12}}>
          <div>
            <span style={{fontFamily:"'Playfair Display',serif",fontSize:18,fontWeight:500,letterSpacing:'-0.01em'}}>Money Stuff Archive</span>
            <span style={{fontSize:11,color:'#aaa',marginLeft:10}}>Matt Levine · Bloomberg · 2012–2026</span>
          </div>
          <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
            {['themes','articles','tickers'].map(t=>(
              <button key={t} onClick={()=>setTab(t)} style={navStyle(t)}>
                {t==='themes'?'Themes':t==='articles'?`Articles (${ARTICLES.length})`:'Tickers'}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={{maxWidth:1000,margin:'0 auto',padding:'1.5rem 1rem 4rem'}}>

        {/* ── THEMES tab ── */}
        {tab==='themes' && (
          <div>
            <p style={{fontSize:14,color:'#555',lineHeight:1.7,marginBottom:'1.5rem',maxWidth:700}}>
              851 issues of Matt Levine's Money Stuff classified across 14 recurring themes.
              Click a bubble or card to explore articles. Use flashcards to drill the lessons.
            </p>

            <div style={{background:'#fff',border:'1px solid #EAEAE4',borderRadius:12,padding:'1rem',marginBottom:'1.5rem'}}>
              <div style={{fontSize:11,color:'#aaa',marginBottom:8}}>
                Bubble size = article count. Click to filter.
                {selectedTheme && <span style={{marginLeft:8,color:TM[selectedTheme]?.color,fontWeight:500}}>Filtering: {selectedTheme} ·{' '}
                  <span style={{cursor:'pointer',textDecoration:'underline'}} onClick={()=>setSelectedTheme(null)}>clear</span>
                </span>}
              </div>
              <BubbleChart selected={selectedTheme} onSelect={setSelectedTheme} />
            </div>

            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))',gap:10}}>
              {THEMES.map(th => {
                const count = themeCounts[th.label] || 0
                const topLessons = ARTICLES.filter(a=>a.themes?.includes(th.label)&&a.lesson?.length>40).slice(0,2)
                return (
                  <div key={th.label} style={{background:'#fff',border:'1px solid #EAEAE4',borderRadius:10,padding:'1rem',cursor:'pointer',
                    borderTop:`3px solid ${th.color}`,
                    opacity: selectedTheme && selectedTheme!==th.label ? 0.5 : 1,
                    transition:'opacity 0.2s'}}
                    onClick={()=>setSelectedTheme(selectedTheme===th.label?null:th.label)}>
                    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
                      <div style={{display:'flex',alignItems:'center',gap:8}}>
                        <span style={{fontSize:18}}>{th.icon}</span>
                        <span style={{fontSize:13,fontWeight:500,color:'#1a1a18'}}>{th.label}</span>
                      </div>
                      <div style={{display:'flex',gap:6,alignItems:'center'}}>
                        <span style={{fontSize:11,color:'#aaa'}}>{count} articles</span>
                        <button onClick={e=>{e.stopPropagation();setFlashTheme(th.label);setTab('flashcard')}}
                          style={{fontSize:10,padding:'2px 7px',color:th.color,borderColor:th.color,background:'transparent'}}>
                          Flashcards
                        </button>
                      </div>
                    </div>
                    {topLessons.length>0 && (
                      <div style={{borderTop:'1px solid #EEEEE8',paddingTop:8,marginTop:4}}>
                        <div style={{fontSize:10,color:'#aaa',marginBottom:4,textTransform:'uppercase',letterSpacing:'0.06em'}}>Sample lesson</div>
                        <div style={{fontSize:11,fontStyle:'italic',color:'#555',lineHeight:1.6}}>"{topLessons[0].lesson.slice(0,110)}{topLessons[0].lesson.length>110?'…':''}"</div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {selectedTheme && (
              <div style={{marginTop:'1.5rem'}}>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
                  <h2 style={{fontFamily:"'Playfair Display',serif",fontSize:18,fontWeight:500}}>{selectedTheme}</h2>
                  <div style={{display:'flex',gap:6}}>
                    <button onClick={()=>{setFlashTheme(selectedTheme);setTab('flashcard')}} style={{fontSize:12,color:TM[selectedTheme]?.color,borderColor:TM[selectedTheme]?.color}}>Flashcards →</button>
                    <button onClick={()=>{setTab('articles')}} style={{fontSize:12}}>All articles →</button>
                  </div>
                </div>
                {ARTICLES.filter(a=>a.themes?.includes(selectedTheme)).slice(0,10).map(a=>(
                  <ArticleRow key={a.id} a={a} expanded={expandedId===a.id} onClick={()=>setExpandedId(id=>id===a.id?null:a.id)} />
                ))}
                {ARTICLES.filter(a=>a.themes?.includes(selectedTheme)).length>10&&(
                  <div style={{textAlign:'center',padding:'1rem',fontSize:12,color:'#888'}}>
                    + {ARTICLES.filter(a=>a.themes?.includes(selectedTheme)).length-10} more ·{' '}
                    <span style={{color:'#1455A0',cursor:'pointer'}} onClick={()=>setTab('articles')}>view all in Articles tab</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── ARTICLES tab ── */}
        {tab==='articles' && (
          <div>
            <div style={{display:'flex',gap:8,marginBottom:'1rem',flexWrap:'wrap',alignItems:'center'}}>
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search titles and lessons…"
                style={{flex:'1 1 220px',maxWidth:320}} />
              <select value={year} onChange={e=>setYear(e.target.value)}>
                {years.map(y=><option key={y} value={y}>{y==='all'?'All years':y}</option>)}
              </select>
              <select value={selectedTheme||''} onChange={e=>setSelectedTheme(e.target.value||null)}>
                <option value=''>All themes</option>
                {THEMES.map(t=><option key={t.label} value={t.label}>{t.label}</option>)}
              </select>
              {(selectedTheme||search||year!=='all') && (
                <button onClick={()=>{setSelectedTheme(null);setSearch('');setYear('all')}} style={{fontSize:11,color:'#888'}}>Clear</button>
              )}
            </div>
            <div style={{fontSize:11,color:'#aaa',marginBottom:8}}>
              {filtered.length}{filtered.length===400?' (showing first 400)':''} articles
              {selectedTheme&&` · ${selectedTheme}`}{search&&` matching "${search}"`}
            </div>
            {filtered.map(a=>(
              <ArticleRow key={a.id} a={a} expanded={expandedId===a.id}
                onClick={()=>setExpandedId(id=>id===a.id?null:a.id)} />
            ))}
            {!filtered.length&&<div style={{textAlign:'center',padding:'3rem',color:'#aaa'}}>No results.</div>}
          </div>
        )}

        {/* ── TICKERS tab ── */}
        {tab==='tickers' && (
          <div>
            <p style={{fontSize:14,color:'#555',lineHeight:1.7,marginBottom:'1.5rem',maxWidth:680}}>
              Stocks mentioned in the archive, with return since Matt first wrote about them.
              Prices via Yahoo Finance (pre-loaded). Not financial advice.
            </p>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(420px,1fr))',gap:'0 2rem'}}>
              <div>
                <div style={{fontSize:11,fontWeight:600,color:'#aaa',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:10}}>Top performers since first mention</div>
                {[...TICKERS].sort((a,b)=>b.return_pct-a.return_pct).slice(0,8).map(t=><TickerCard key={t.ticker} t={t}/>)}
              </div>
              <div>
                <div style={{fontSize:11,fontWeight:600,color:'#aaa',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:10}}>By mention count</div>
                {[...TICKERS].sort((a,b)=>b.mention_count-a.mention_count).map(t=><TickerCard key={t.ticker} t={t}/>)}
              </div>
            </div>
            <p style={{fontSize:11,color:'#ccc',marginTop:'2rem'}}>Return = price on first mention date → current price. Delisted companies (TWTR, CS, SIVB, WE) excluded.</p>
          </div>
        )}

      </div>

      {/* Footer */}
      <div style={{borderTop:'1px solid #EAEAE4',padding:'1.5rem 1rem',textAlign:'center',fontSize:11,color:'#bbb',background:'#fff'}}>
        Money Stuff Archive · Unofficial fan archive · Matt Levine writes for{' '}
        <a href="https://www.bloomberg.com/opinion/authors/ARbTQlRLRjE/matthew-s-levine" target="_blank" rel="noreferrer" style={{color:'#aaa'}}>Bloomberg Opinion</a>
        {' '}· Subscribe at{' '}
        <a href="http://link.mail.bloombergbusiness.com/join/4wm/moneystuff-signup" target="_blank" rel="noreferrer" style={{color:'#aaa'}}>bloomberg.com</a>
      </div>
    </div>
  )
}
