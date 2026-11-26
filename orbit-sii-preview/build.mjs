import { build } from "esbuild";
import { readFile, mkdir, copyFile } from "node:fs/promises";
import { resolve } from "node:path";

await mkdir("dist/server",{recursive:true});
await mkdir("dist/.openai",{recursive:true});
await build({
  entryPoints:["worker.js"],outfile:"dist/server/index.js",bundle:true,format:"esm",platform:"browser",
  loader:{".html":"text",".css":"text"},
  plugins:[{ name:"text-assets", setup(builder){
    builder.onResolve({filter:/\?text$/},args=>({path:resolve(args.resolveDir,args.path.replace(/\?text$/,"")),namespace:"raw-text"}));
    builder.onLoad({filter:/.*/,namespace:"raw-text"},async(args)=>({contents:await readFile(args.path,"utf8"),loader:"text"}));
  }}]
});
await copyFile(".openai/hosting.json","dist/.openai/hosting.json");
