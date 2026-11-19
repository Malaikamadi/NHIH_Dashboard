// Generate real PNG icons without additional packages, on every production build.
import { mkdirSync, writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

const crcTable = Array.from({length:256},(_,n)=>{let c=n;for(let k=0;k<8;k++)c=(c&1)?(0xedb88320^(c>>>1)):(c>>>1);return c>>>0})
function chunk(type,data){const t=Buffer.from(type);const length=Buffer.alloc(4);length.writeUInt32BE(data.length);let crc=0xffffffff;for(const byte of Buffer.concat([t,data]))crc=crcTable[(crc^byte)&255]^(crc>>>8);const checksum=Buffer.alloc(4);checksum.writeUInt32BE((crc^0xffffffff)>>>0);return Buffer.concat([length,t,data,checksum])}
function render(size){const pixels=Buffer.alloc(size*(size*4+1));const unit=size/512;for(let y=0;y<size;y++){const row=y*(size*4+1);pixels[row]=0;for(let x=0;x<size;x++){const X=x/unit,Y=y/unit;let rgb=[23,61,99];if(X>90&&X<422&&Y>92&&Y<412)rgb=[40,83,121];if((Y>175&&Y<200&&X>142&&X<370)||(Y>245&&Y<270&&X>142&&X<300)||(Y>317&&Y<342&&X>142&&X<370))rgb=[255,255,255];if((X-360)**2+(Y-258)**2<20**2)rgb=[142,216,180];const p=row+1+x*4;pixels[p]=rgb[0];pixels[p+1]=rgb[1];pixels[p+2]=rgb[2];pixels[p+3]=255}}
const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(size,0);ihdr.writeUInt32BE(size,4);ihdr[8]=8;ihdr[9]=6;const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(pixels)),chunk('IEND',Buffer.alloc(0))]);writeFileSync('public/desk-icon-'+size+'.png',png)}
mkdirSync('public',{recursive:true});for(const size of [192,512])render(size)
