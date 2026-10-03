/** Positive results only, keyed by complete values rather than mutable identities.
 * Accessors, symbols, unusual prototypes and cycles always use the real validator.
 * Explicit undefined, array holes and -0 remain distinct in the content key.
 */
const prototypeBaselines=[Object.prototype,Array.prototype].map(prototype=>({prototype,parent:Object.getPrototypeOf(prototype),descriptors:Object.getOwnPropertyDescriptors(prototype)}));
function unchangedPrototypes():boolean {
  for(const {prototype,parent,descriptors} of prototypeBaselines){
    if(Object.getPrototypeOf(prototype)!==parent)return false;
    const names=Reflect.ownKeys(prototype),prior=Reflect.ownKeys(descriptors);
    if(names.length!==prior.length)return false;
    for(const name of names){const before=Reflect.get(descriptors,name) as PropertyDescriptor|undefined,after=Object.getOwnPropertyDescriptor(prototype,name);
      if(!before||!after||before.enumerable!==after.enumerable||before.configurable!==after.configurable||before.writable!==after.writable||before.get!==after.get||before.set!==after.set||!Object.is(before.value,after.value))return false;
    }
  }
  return true;
}
function contentKey(values: unknown[], ceiling: number): string | undefined {
  let bytes = 0;
  const active = new Set<object>();
  const charge = (text: string) => {bytes += text.length * 2;if (bytes > ceiling) throw new Error('uncacheable');return text;};
  function encode(value: unknown): string {
    if(value === null)return charge('L');
    if(value === undefined)return charge('U');
    if(typeof value === 'boolean')return charge(value ? 'B1' : 'B0');
    if(typeof value === 'number')return charge(`N${Object.is(value,-0)?'-0':String(value)};`);
    if(typeof value === 'string')return charge(`S${JSON.stringify(value)}`);
    if(typeof value !== 'object')throw new Error('uncacheable');
    const proto=Object.getPrototypeOf(value);
    if(!Array.isArray(value) && proto!==Object.prototype && proto!==null)throw new Error('uncacheable');
    if(Array.isArray(value) && proto!==Array.prototype)throw new Error('uncacheable');
    if(active.has(value) || Object.getOwnPropertySymbols(value).length)throw new Error('uncacheable');
    active.add(value);
    const fields = Object.getOwnPropertyNames(value).map(key=>{
      const descriptor=Object.getOwnPropertyDescriptor(value,key)!;
      if(!('value' in descriptor))throw new Error('uncacheable');
      // structuredClone skips non-enumerable children. Such a child could hide
      // a Proxy with different reads while imitating a plain value's key.
      if(!descriptor.enumerable && !(Array.isArray(value) && key==='length'))throw new Error('uncacheable');
      return `${charge(JSON.stringify(key))}:${descriptor.enumerable?'e':'n'}${descriptor.writable?'w':'r'}${descriptor.configurable?'c':'f'}:${encode(descriptor.value)}`;
    });
    active.delete(value);
    return `${Array.isArray(value)?'A':proto===null?'Z':'O'}{${fields.join(',')}}`;
  }
  try{return encode(values);}catch{return undefined;}
}

/** Cached hits contain no state and cannot confer facts, actions or rewards. */
export function memoizePositiveValidation<Args extends unknown[]>(
  validate: (...args: Args)=>boolean,
  budget = 12 * 1024 * 1024,
): (...args: Args)=>boolean {
  const results=new Map<string,number>();
  let used=0;
  return (...args: Args) => {
    if(!unchangedPrototypes())return validate(...args);
    const key=contentKey(args,Math.min(budget,1024*1024));
    // A Proxy can imitate plain descriptors while remaining unclonable. It must
    // never borrow a plain object's cached result. No getters reach this path.
    if(key!==undefined){try{structuredClone(args);}catch{return validate(...args);}}
    if(key!==undefined && results.has(key))return true;
    const valid=validate(...args);
    if(valid && key!==undefined){
      const cost=key.length*2;
      while(used+cost>budget && results.size){const oldest=results.keys().next().value!;used-=results.get(oldest)!;results.delete(oldest);}
      if(cost<=budget){results.set(key,cost);used+=cost;}
    }
    return valid;
  };
}
