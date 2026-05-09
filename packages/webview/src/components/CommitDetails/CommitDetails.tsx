import type { ReactElement } from "react";
import type { CommitDetailsViewModel, FileViewMode } from "../../app/rpcContract.generated";
import { FileChanges, type FileChangesLabels } from "../FileChanges/FileChanges";

export interface CommitDetailsLabels {
  files?: Partial<FileChangesLabels>;
  selectCommit: string;
}

const defaultLabels: CommitDetailsLabels = {
  selectCommit: "Select a commit to view details."
};

export interface CommitDetailsProps {
  commit?: CommitDetailsViewModel;
  fileViewMode: FileViewMode;
  labels?: Partial<CommitDetailsLabels>;
  onFileViewModeChange?: (mode: FileViewMode) => void;
  onOpenFile?: (path: string) => void;
  onOpenFileDiff?: (path: string) => void;
  onOpenFileHistory?: (path: string) => void;
}

export function CommitDetails({
  commit,
  fileViewMode,
  labels,
  onFileViewModeChange,
  onOpenFile,
  onOpenFileDiff,
  onOpenFileHistory
}: CommitDetailsProps): ReactElement {
  const text = { ...defaultLabels, ...labels };
  if (!commit) {
    return (
      <div className="p-4 text-xs text-[var(--vscode-descriptionForeground)]">
        {text.selectCommit}
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 text-xs">
      <section className="space-y-1 border-b border-[var(--vscode-panel-border)] pb-3">
        <div className="break-all font-mono text-[11px] text-[var(--vscode-descriptionForeground)]">{commit.hash}</div>
        <h2 className="text-sm font-semibold">{commit.message}</h2>
        <div className="flex items-center gap-2 text-[11px] text-[var(--vscode-descriptionForeground)]">
          <img alt={`${commit.author} avatar`} className="h-8 w-8 rounded-full" src={createAvatarUri(commit.email)} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <AuthorName author={commit.author} email={commit.email} />
              <span className="truncate">{commit.email}</span>
            </div>
            <div>{commit.date}</div>
          </div>
        </div>
        <p className="max-w-[72ch] text-[11px] leading-5 text-[var(--vscode-descriptionForeground)]">
          {commit.body}
        </p>
      </section>
      <FileChanges
        files={commit.files}
        labels={text.files}
        mode={fileViewMode}
        onModeChange={onFileViewModeChange}
        onOpenFile={onOpenFile}
        onOpenFileDiff={onOpenFileDiff}
        onOpenFileHistory={onOpenFileHistory}
      />
    </div>
  );
}

function AuthorName({ author, email }: { author: string; email: string }): ReactElement {
  const profileUrl = createAuthorProfileUrl(email);
  if (!profileUrl) {
    return <span className="font-medium text-[var(--vscode-editor-foreground)]">{author}</span>;
  }

  return (
    <a className="font-medium text-[var(--vscode-textLink-foreground)] hover:underline" href={profileUrl} rel="noreferrer" target="_blank">
      {author}
    </a>
  );
}

function createAuthorProfileUrl(email: string): string | undefined {
  const githubNoreplyMatch = /^(?:(?:\d+\+)?([^@]+)@users\.noreply\.github\.com)$/i.exec(email.trim());
  return githubNoreplyMatch ? `https://github.com/${githubNoreplyMatch[1]!}` : undefined;
}

function createAvatarUri(email: string): string {
  const digest = md5(email.trim().toLowerCase());
  return `https://www.gravatar.com/avatar/${digest}?s=64&d=identicon`;
}

function md5(input: string): string {
  const bytes = new TextEncoder().encode(input);
  const bitLength = bytes.length * 8;
  const paddedLength = (((bytes.length + 8) >> 6) + 1) << 6;
  const buffer = new Uint8Array(paddedLength);
  buffer.set(bytes);
  buffer[bytes.length] = 0x80;

  const view = new DataView(buffer.buffer);
  view.setUint32(paddedLength - 8, bitLength, true);

  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;
  const shifts = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21
  ];
  const constants = Array.from({ length: 64 }, (_, index) => Math.floor(Math.abs(Math.sin(index + 1)) * 2 ** 32));

  for (let offset = 0; offset < paddedLength; offset += 64) {
    let a = a0;
    let b = b0;
    let c = c0;
    let d = d0;
    const words = Array.from({ length: 16 }, (_, index) => view.getUint32(offset + index * 4, true));

    for (let index = 0; index < 64; index += 1) {
      let f: number;
      let g: number;
      if (index < 16) {
        f = (b & c) | (~b & d);
        g = index;
      } else if (index < 32) {
        f = (d & b) | (~d & c);
        g = (5 * index + 1) % 16;
      } else if (index < 48) {
        f = b ^ c ^ d;
        g = (3 * index + 5) % 16;
      } else {
        f = c ^ (b | ~d);
        g = (7 * index) % 16;
      }

      const next = d;
      d = c;
      c = b;
      b = add32(b, leftRotate(add32(add32(a, f), add32(constants[index]!, words[g]!)), shifts[index]!));
      a = next;
    }

    a0 = add32(a0, a);
    b0 = add32(b0, b);
    c0 = add32(c0, c);
    d0 = add32(d0, d);
  }

  return [a0, b0, c0, d0].map(wordToHex).join("");
}

function add32(a: number, b: number): number {
  return (a + b) >>> 0;
}

function leftRotate(value: number, bits: number): number {
  return ((value << bits) | (value >>> (32 - bits))) >>> 0;
}

function wordToHex(word: number): string {
  return [0, 8, 16, 24].map((shift) => ((word >>> shift) & 0xff).toString(16).padStart(2, "0")).join("");
}
