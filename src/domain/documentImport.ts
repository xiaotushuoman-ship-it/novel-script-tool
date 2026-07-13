import { extractRawText } from "mammoth";

const DOCX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export async function readImportedDocument(file: File, options: { allowDocx: boolean }): Promise<string> {
  if (!isDocxFile(file)) return readTextFile(file);
  if (!options.allowDocx) throw new Error("当前功能不支持 DOCX 文档");

  const result = await extractRawText({ arrayBuffer: await readArrayBuffer(file) });
  const text = result.value.trim();
  if (!text) throw new Error("DOCX 文档中没有可读取的文字");
  return text;
}

function isDocxFile(file: File) {
  return file.name.toLowerCase().endsWith(".docx") || file.type === DOCX_MIME_TYPE;
}

function readTextFile(file: File) {
  if (typeof file.text === "function") return file.text();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

function readArrayBuffer(file: File) {
  if (typeof file.arrayBuffer === "function") return file.arrayBuffer();
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) {
        resolve(reader.result);
        return;
      }
      reject(new Error("无法读取 DOCX 文档"));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}
