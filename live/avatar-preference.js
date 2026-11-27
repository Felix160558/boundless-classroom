const storageKey='boundless.classroom.avatar.v2';
const appearances=new Set(['simple','orange-cat','frog-girl']);
const listeners=new Set();
let current='simple';
let unlocked=false;

try {
  const saved=JSON.parse(localStorage.getItem(storageKey));
  unlocked=saved?.orangeCatUnlocked===true;
  if (appearances.has(saved?.avatar) && (unlocked || saved.avatar!=='orange-cat')) current=saved.avatar;
} catch {
  // The room can still change appearance when browser storage is unavailable.
}

export const avatarPreference={
  get current(){return current;},
  get unlocked(){return unlocked;},
  select(avatar){
    if (!appearances.has(avatar)) return false;
    current=avatar;
    if (avatar==='orange-cat') unlocked=true;
    try {
      localStorage.setItem(storageKey,JSON.stringify({avatar:current,orangeCatUnlocked:unlocked}));
    } catch {}
    for (const listener of listeners) listener(current);
    return true;
  },
  subscribe(listener){
    listeners.add(listener);
    return ()=>listeners.delete(listener);
  },
};
