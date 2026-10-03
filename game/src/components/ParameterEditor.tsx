import type { FactMap, ToolProtocol } from '../engine';

/** Values retain their actual type: the string "1" never becomes integer 1. */
export default function ParameterEditor({protocol,value,onChange,prefix,disabled=false}:{protocol:ToolProtocol;value:FactMap;onChange:(args:FactMap)=>void;prefix:string;disabled?:boolean}) {
  return <div className="parameter-fields">{protocol.parameters.map(field=><label key={field.name}>
    <span>{field.label} <small>{field.name} · {field.type==='integer'?'整数':field.type==='boolean'?'是 / 否':'文字'}{field.required?' · 必填':''}{field.minimum!==undefined?` · ${field.minimum}–${field.maximum}`:''}</small></span>
    <select id={`${prefix}-${field.name}`} aria-label={`${field.label}参数`} disabled={disabled}
      value={Object.hasOwn(value,field.name)?JSON.stringify(value[field.name]):'__missing__'}
      onChange={event=>{const next={...value};if(event.target.value==='__missing__')delete next[field.name];else next[field.name]=JSON.parse(event.target.value);onChange(next);}}>
      <option value="__missing__">留空 · 不传这个字段</option>
      {field.choices.map((choice,index)=><option key={index} value={JSON.stringify(choice.value)}>{choice.label}</option>)}
    </select>
  </label>)}</div>;
}
