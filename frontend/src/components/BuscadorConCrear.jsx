import { useEffect, useRef, useState } from 'react';

/* ── Inline styles (sin dependencia de Tailwind) ── */
const S = {
  box:        { position: 'relative', width: '100%' },
  row:        { display: 'flex', gap: '8px', alignItems: 'center' },
  inputBox:   { position: 'relative', flex: 1 },
  icon:       { position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)',
                width: '16px', height: '16px', color: '#94a3b8', pointerEvents: 'none' },
  input:      { width: '100%', padding: '8px 12px 8px 34px', fontSize: '14px', lineHeight: '1.5',
                borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none',
                color: '#1e293b', backgroundColor: '#fff', boxSizing: 'border-box',
                transition: 'border-color 0.15s, box-shadow 0.15s' },
  inputOk:    { borderColor: '#4ade80', backgroundColor: '#f0fdf4' },
  inputFocus: { borderColor: '#3b82f6', boxShadow: '0 0 0 3px rgba(59,130,246,0.15)' },
  changeBtn:  { padding: '6px 12px', fontSize: '12px', fontWeight: 500, cursor: 'pointer',
                border: '1px solid #cbd5e1', borderRadius: '8px', backgroundColor: '#fff',
                color: '#475569', whiteSpace: 'nowrap' },
  drop:       { position: 'absolute', zIndex: 30, width: '100%', marginTop: '4px',
                backgroundColor: '#fff', border: '1px solid #e2e8f0',
                borderRadius: '12px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
                overflow: 'hidden', maxHeight: '240px', overflowY: 'auto' },
  opt:        { width: '100%', textAlign: 'left', padding: '10px 16px', fontSize: '14px',
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                border: 'none', backgroundColor: 'transparent', color: '#1e293b' },
  newBtn:     { padding: '6px 12px', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                border: '1px solid #bfdbfe', borderRadius: '8px', backgroundColor: '#eff6ff',
                color: '#2563eb', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '4px',
                transition: 'background-color 0.15s' },
  noRes:      { padding: '10px 16px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' },
  /* Modal overlay — z-index 9999 para estar encima de mapa Leaflet y sidebar mobile */
  overlay:    { position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center',
                justifyContent: 'center', padding: '16px' },
  backdrop:   { position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)',
                backdropFilter: 'blur(4px)' },
  formBox:    { position: 'relative', zIndex: 1, width: '100%', maxWidth: '540px',
                maxHeight: '90vh', backgroundColor: '#fff', borderRadius: '16px',
                boxShadow: '0 20px 60px rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column' },
  formHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '16px 20px', borderBottom: '1px solid #e2e8f0', flexShrink: 0 },
  formTitle:  { fontSize: '16px', fontWeight: 700, color: '#1e293b', margin: 0 },
  closeBtn:   { width: '32px', height: '32px', borderRadius: '8px', border: 'none',
                backgroundColor: 'transparent', cursor: 'pointer', color: '#94a3b8',
                display: 'flex', alignItems: 'center', justifyContent: 'center' },
  formBody:   { flex: 1, overflowY: 'auto', padding: '20px' },
  formGrid:   { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' },
  fieldWrap:  {},
  fieldFull:  { gridColumn: '1 / -1' },
  fieldLabel: { display: 'block', fontSize: '12px', color: '#64748b', fontWeight: 500, marginBottom: '4px' },
  fieldInput: { width: '100%', padding: '8px 10px', fontSize: '13px', border: '1px solid #cbd5e1',
                borderRadius: '8px', outline: 'none', color: '#1e293b', boxSizing: 'border-box',
                backgroundColor: '#fff' },
  fieldHint:  { fontSize: '11px', color: '#94a3b8', marginTop: '2px' },
  sectionTitle: { gridColumn: '1 / -1', fontSize: '11px', fontWeight: 700, color: '#94a3b8',
                  textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '8px', marginBottom: 0 },
  formFooter: { display: 'flex', gap: '8px', justifyContent: 'flex-end',
                padding: '16px 20px', borderTop: '1px solid #e2e8f0', flexShrink: 0 },
  cancelBtn:  { padding: '8px 16px', fontSize: '13px', border: '1px solid #cbd5e1',
                borderRadius: '8px', backgroundColor: '#fff', cursor: 'pointer', color: '#64748b' },
  saveBtn:    { padding: '8px 16px', fontSize: '13px', border: 'none', borderRadius: '8px',
                backgroundColor: '#2563eb', color: '#fff', cursor: 'pointer', fontWeight: 600 },
  formErr:    { gridColumn: '1 / -1', fontSize: '12px', color: '#dc2626', margin: 0 },
  actionRow:  { display: 'flex', gap: '6px', alignItems: 'flex-end' },
  actionBtn:  { padding: '6px 10px', fontSize: '11px', fontWeight: 600,
                border: '1px solid #bfdbfe', borderRadius: '6px',
                backgroundColor: '#eff6ff', color: '#2563eb', cursor: 'pointer',
                whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '4px',
                height: '34px', flexShrink: 0 },
  actionSpin: { width: '12px', height: '12px', border: '2px solid #93c5fd',
                borderTopColor: '#2563eb', borderRadius: '50%',
                animation: 'spin 0.6s linear infinite' },
};

/**
 * BuscadorConCrear — Autocomplete con creación inline (modal)
 *
 * Props:
 *  - placeholder    string
 *  - value          object | null
 *  - onChange        (item | null) => void
 *  - onSearch        (query: string) => Promise<array>
 *  - onCreate        (data) => Promise<object>
 *  - createFields    [{ key, label, required?, type?, options?, placeholder?, hint?, wide? }]
 *                    type: 'text'|'number'|'email'|'select'|'textarea'  (default 'text')
 *                    options: [{ value, label }]  (solo para type='select')
 *                    wide: true → ocupa 2 columnas
 *  - createTitle     string  (título del modal, default 'Crear nuevo')
 *  - displayField    string  (default 'nombre')
 *  - renderOption    (item) => ReactNode
 */
export default function BuscadorConCrear({
  placeholder = 'Buscar…', value, onChange,
  onSearch, onCreate, createFields = [], createTitle = 'Crear nuevo',
  displayField = 'nombre', renderOption, onNewClick,
}) {
  const [query, setQuery]       = useState('');
  const [results, setResults]   = useState([]);
  const [showDrop, setShowDrop] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({});
  const [formErr, setFormErr]   = useState('');
  const [saving, setSaving]     = useState(false);
  const [focused, setFocused]   = useState(false);
  const boxRef = useRef(null);
  const timer  = useRef(null);

  /* Sync cuando el padre limpia value */
  useEffect(() => {
    if (!value) setQuery('');
  }, [value]);

  /* Click fuera → cerrar dropdown */
  useEffect(() => {
    const handler = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) {
        setShowDrop(false);
        setFocused(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  function handleInput(val) {
    setQuery(val);
    if (value) onChange(null);
    setShowDrop(true);
    setShowForm(false);
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      if (!val.trim()) { setResults([]); return; }
      try {
        const data = await onSearch(val);
        setResults(Array.isArray(data) ? data : []);
      } catch { setResults([]); }
    }, 250);
  }

  function select(item) {
    onChange(item);
    setQuery(item[displayField] || '');
    setShowDrop(false);
    setShowForm(false);
  }

  function clear() {
    onChange(null);
    setQuery('');
    setResults([]);
  }

  function openForm() {
    setShowDrop(false);
    setShowForm(true);
    // Inicializar defaults (para selects con valor por defecto)
    const defaults = {};
    createFields.forEach(f => {
      if (f.defaultValue !== undefined) defaults[f.key] = f.defaultValue;
    });
    setFormData(defaults);
    setFormErr('');
  }

  async function handleCreate(e) {
    e.preventDefault();
    for (const f of createFields) {
      if (f.required && !String(formData[f.key] || '').trim()) {
        return setFormErr(`${f.label} es obligatorio`);
      }
    }
    setSaving(true); setFormErr('');
    try {
      const created = await onCreate(formData);
      select(created);
      setShowForm(false);
    } catch (err) {
      setFormErr(err.response?.data?.error || 'Error al crear');
    } finally { setSaving(false); }
  }

  const [actionLoading, setActionLoading] = useState({});

  function renderField(f, idx) {
    const val = formData[f.key] || '';
    const onChange = e => {
      let v = e.target.value;
      if (f.transform) v = f.transform(v);
      setFormData(p => ({ ...p, [f.key]: v }));
    };

    // Section header
    if (f.type === 'section') {
      return <p key={f.key} style={S.sectionTitle}>{f.label}</p>;
    }

    const wrapStyle = f.wide ? S.fieldFull : S.fieldWrap;
    const hasAction = f.action && f.action.show && f.action.show(val);
    const isActionLoading = actionLoading[f.key];

    async function handleAction() {
      if (!f.action?.onClick || isActionLoading) return;
      setActionLoading(p => ({ ...p, [f.key]: true }));
      try {
        const patch = await f.action.onClick(val, formData, setFormData);
        if (patch && typeof patch === 'object') {
          setFormData(p => ({ ...p, ...patch }));
        }
      } catch { /* fail silently */ }
      setActionLoading(p => ({ ...p, [f.key]: false }));
    }

    const inputEl = f.type === 'select' ? (
      <select style={S.fieldInput} value={val} onChange={onChange}>
        {(f.options || []).map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    ) : f.type === 'textarea' ? (
      <textarea
        style={{ ...S.fieldInput, resize: 'vertical', minHeight: '48px' }}
        rows={2}
        value={val}
        onChange={onChange}
        placeholder={f.placeholder || ''}
      />
    ) : (
      <input
        style={{ ...S.fieldInput, ...(f.readOnly ? { backgroundColor: '#f8fafc' } : {}) }}
        type={f.type || 'text'}
        value={val}
        onChange={onChange}
        placeholder={f.placeholder || ''}
        min={f.min}
        step={f.step}
        maxLength={f.maxLength}
        autoFocus={idx === 0}
        readOnly={f.readOnly || false}
      />
    );

    return (
      <div key={f.key} style={wrapStyle}>
        <label style={S.fieldLabel}>
          {f.label} {f.required && <span style={{ color: '#ef4444' }}>*</span>}
        </label>
        {hasAction ? (
          <div style={S.actionRow}>
            <div style={{ flex: 1 }}>{inputEl}</div>
            <button type="button" onClick={handleAction} disabled={isActionLoading}
              style={{ ...S.actionBtn, opacity: isActionLoading ? 0.7 : 1 }}>
              {isActionLoading
                ? <div style={S.actionSpin} />
                : null}
              {f.action.label || 'Completar'}
            </button>
          </div>
        ) : inputEl}
        {f.hint && <p style={S.fieldHint}>{f.hint}</p>}
      </div>
    );
  }

  const inputStyle = {
    ...S.input,
    ...(value ? S.inputOk : {}),
    ...(focused && !value ? S.inputFocus : {}),
  };

  return (
    <div ref={boxRef} style={S.box}>
      <div style={S.row}>
        <div style={S.inputBox}>
          <svg style={S.icon} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="8" /><path strokeLinecap="round" d="M21 21l-4.35-4.35" />
          </svg>
          <input
            value={value ? (value[displayField] || '') : query}
            onChange={e => handleInput(e.target.value)}
            onFocus={() => { setFocused(true); if (!value && results.length) setShowDrop(true); }}
            onBlur={() => setFocused(false)}
            placeholder={placeholder}
            readOnly={!!value}
            style={inputStyle}
          />
        </div>
        {(onCreate || onNewClick) && !value && (
          <button type="button" onClick={onNewClick || openForm} style={S.newBtn}
            onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#dbeafe'; }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#eff6ff'; }}>
            <span style={{ fontSize: '15px', lineHeight: 1 }}>+</span> Nuevo
          </button>
        )}
        {value && (
          <button type="button" onClick={clear} style={S.changeBtn}>Cambiar</button>
        )}
      </div>

      {/* Dropdown */}
      {showDrop && !value && (
        <div style={S.drop}>
          {results.length > 0 ? results.map((item, i) => (
            <button key={item.id ?? i} type="button" onMouseDown={() => select(item)}
              style={S.opt}
              onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#eff6ff'; }}
              onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; }}>
              {renderOption ? renderOption(item) : (
                <span style={{ fontWeight: 500 }}>{item[displayField]}</span>
              )}
            </button>
          )) : query.trim() ? (
            <div style={S.noRes}>Sin resultados</div>
          ) : null}
        </div>
      )}

      {/* Create form — modal overlay z-9999 */}
      {showForm && (
        <div style={S.overlay}>
          <div style={S.backdrop} onClick={() => setShowForm(false)} />
          <div style={S.formBox}>
            <div style={S.formHeader}>
              <p style={S.formTitle}>{createTitle}</p>
              <button type="button" onClick={() => setShowForm(false)} style={S.closeBtn}>
                <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
              <div style={S.formBody}>
                <div style={S.formGrid}>
                  {createFields.map((f, idx) => renderField(f, idx))}
                  {formErr && <p style={S.formErr}>{formErr}</p>}
                </div>
              </div>
              <div style={S.formFooter}>
                <button type="button" onClick={() => setShowForm(false)} style={S.cancelBtn}>
                  Cancelar
                </button>
                <button type="submit" disabled={saving}
                  style={{ ...S.saveBtn, opacity: saving ? 0.6 : 1 }}>
                  {saving ? 'Creando…' : 'Crear'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
