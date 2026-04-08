import type {
  DOMConversionMap,
  DOMConversionOutput,
  DOMExportOutput,
  EditorConfig,
  LexicalNode,
  NodeKey,
  RangeSelection,
  SerializedElementNode,
} from "lexical"
import { $createParagraphNode, ElementNode } from "lexical"

export type SerializedTitleNode = SerializedElementNode

function $convertTitleElement(): DOMConversionOutput | null {
  return { node: $createTitleNode() }
}

export class TitleNode extends ElementNode {
  constructor(key?: NodeKey) {
    super(key)
  }

  static getType(): string {
    return "title"
  }

  static clone(node: TitleNode): TitleNode {
    return new TitleNode(node.__key)
  }

  createDOM(config: EditorConfig): HTMLElement {
    const dom = document.createElement("h1")
    if (typeof config.theme.titleBlock === "string") {
      dom.className = config.theme.titleBlock
    } else {
      dom.className =
        "min-w-0 w-full bg-transparent text-3xl font-extrabold text-foreground focus:outline-none lg:text-4xl"
    }
    dom.setAttribute("data-lexical-title", "true")
    dom.setAttribute("data-placeholder", "Enter title here")
    return dom
  }

  updateDOM(): boolean {
    return false
  }

  exportDOM(): DOMExportOutput {
    const element = document.createElement("h1")
    element.setAttribute("data-lexical-title", "true")
    return { element }
  }

  static importDOM(): DOMConversionMap | null {
    return {
      h1: (domNode: HTMLElement) => {
        if (!domNode.hasAttribute("data-lexical-title")) {
          return null
        }
        return {
          conversion: $convertTitleElement,
          priority: 3,
        }
      },
    }
  }

  static importJSON(): TitleNode {
    return $createTitleNode()
  }

  exportJSON(): SerializedTitleNode {
    return {
      ...super.exportJSON(),
      type: "title",
      version: 1,
    }
  }

  // Title node is always the first child of root — prevent deletion
  canBeEmpty(): boolean {
    return true
  }

  // Pressing Enter at end of title should create a paragraph below
  insertNewAfter(_: RangeSelection, restoreSelection?: boolean): LexicalNode {
    const paragraph = $createParagraphNode()
    this.insertAfter(paragraph, restoreSelection)
    return paragraph
  }

  collapseAtStart(): boolean {
    return true
  }
}

export function $createTitleNode(): TitleNode {
  return new TitleNode()
}

export function $isTitleNode(
  node: LexicalNode | null | undefined
): node is TitleNode {
  return node instanceof TitleNode
}
