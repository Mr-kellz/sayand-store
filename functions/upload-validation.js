'use strict';
function evidenceType(b) {
 if(b.length<16)return null;
 if(b.subarray(0,3).equals(Buffer.from([255,216,255])))return {mime:'image/jpeg',ext:'jpg'};
 if(b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return {mime:'image/png',ext:'png'};
 if(b.toString('ascii',0,4)==='RIFF' && b.toString('ascii',8,12)==='WEBP')return {mime:'image/webp',ext:'webp'};
 if(b.toString('ascii',4,8)==='ftyp' && /^(isom|iso2|mp41|mp42|avc1|M4V )$/.test(b.toString('ascii',8,12)))return {mime:'video/mp4',ext:'mp4'};
 if(b.subarray(0,4).equals(Buffer.from([26,69,223,163])) && b.subarray(0,4096).includes(Buffer.from('webm')))return {mime:'video/webm',ext:'webm'};
 return null;
}
module.exports={evidenceType};
