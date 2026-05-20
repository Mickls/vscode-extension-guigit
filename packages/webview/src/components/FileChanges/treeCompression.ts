export interface CompressibleTreeNode<TNode extends CompressibleTreeNode<TNode>> {
  children: Map<string, TNode>;
  file?: unknown;
}

export interface CompressedDirectory<TNode> {
  label: string;
  node: TNode;
  path: string;
}

export function compressDirectoryChain<TNode extends CompressibleTreeNode<TNode>>(input: {
  name: string;
  node: TNode;
  path: string;
}): CompressedDirectory<TNode> {
  const labelParts = [input.name];
  let current = input.node;
  let currentPath = input.path;

  while (!current.file && current.children.size === 1) {
    const [childName, child] = [...current.children.entries()][0]!;
    if (child.file) {
      break;
    }

    labelParts.push(childName);
    current = child;
    currentPath = `${currentPath}/${childName}`;
  }

  return {
    label: labelParts.join("/"),
    node: current,
    path: currentPath
  };
}
