type Point = {x:number;y:number};

export function followCamera(current:Point,target:Point,dt:number,reset=false):Point {
 // Filter snapshot correction pulses without delaying teleports or map changes.
 if(reset||Math.hypot(target.x-current.x,target.y-current.y)>3)return {...target};
 const blend=1-Math.exp(-20*Math.max(0,dt));
 return {x:current.x+(target.x-current.x)*blend,y:current.y+(target.y-current.y)*blend};
}
