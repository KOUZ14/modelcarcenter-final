import { ValidationError } from "./validation";
// Only JPEG is accepted. Drop metadata segments (including EXIF/GPS, XMP,
// comments and thumbnails) while retaining quantization, frame and scan data.
export function stripPhotoMetadata(bytes:Uint8Array) {
  if(bytes.length<4||bytes[0]!==255||bytes[1]!==216)throw new ValidationError("Upload a JPEG photo.");
  const chunks:Uint8Array[]=[bytes.slice(0,2)];let offset=2,scan=false,ended=false;
  while(offset<bytes.length){
    if(bytes[offset]!==255)throw new ValidationError("Invalid JPEG photo.");
    const start=offset;while(bytes[offset]===255)offset++;const marker=bytes[offset++];
    if(marker===0xd9){chunks.push(bytes.slice(start,offset));ended=true;break;}
    const length=(bytes[offset]<<8)|bytes[offset+1];if(length<2||offset+length>bytes.length)throw new ValidationError("Invalid JPEG photo.");
    if(!(marker>=0xe0&&marker<=0xef)&&marker!==0xfe)chunks.push(bytes.slice(start,offset+length));offset+=length;
    if(marker===0xda){scan=true;const entropyStart=offset;while(offset<bytes.length){if(bytes[offset]!==255){offset++;continue;}let next=offset+1;while(bytes[next]===255)next++;if(bytes[next]===0||(bytes[next]>=0xd0&&bytes[next]<=0xd7)){offset=next+1;continue;}break;}chunks.push(bytes.slice(entropyStart,offset));}
  }
  if(!scan||!ended)throw new ValidationError("Invalid JPEG photo.");
  const result=new Uint8Array(chunks.reduce((sum,c)=>sum+c.length,0));let pos=0;for(const chunk of chunks){result.set(chunk,pos);pos+=chunk.length;}return result;
}
