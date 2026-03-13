import { GraphEditor } from "./graph-editor.js";
import { NoteEditor } from "./note-editor.js";
import { WorkspaceState } from "./workspace-state.js";

const STORAGE_KEY = "track.workspace.v1";

export class WorkspaceApp {
  #workspace;
  #graphEditor;
  #breadcrumb;
  #graphScreen;
  #noteScreen;
  #noteBackButton;
  #noteTitle;
  #noteEditor;
  #noteContext = null;
  #hasSeeded = false;

  constructor({
    board,
    nodesLayer,
    edgesLayer,
    nodeTemplate,
    breadcrumb,
    graphScreen,
    noteScreen,
    noteBackButton,
    noteTitle,
    noteEditorRoot,
  }) {
    const savedState = this.#loadState();
    this.#breadcrumb = breadcrumb;
    this.#graphScreen = graphScreen;
    this.#noteScreen = noteScreen;
    this.#noteBackButton = noteBackButton;
    this.#noteTitle = noteTitle;
    this.#workspace = new WorkspaceState({
      snapshot: savedState?.workspace ?? null,
      onChange: () => this.#saveState(),
    });
    this.#noteEditor = new NoteEditor({
      root: noteEditorRoot,
      onChange: (value) => this.#persistActiveNote(value),
    });

    this.#graphEditor = new GraphEditor({
      board,
      nodesLayer,
      edgesLayer,
      nodeTemplate,
      onOpenSubgraph: (nodeId) => this.#openSubgraph(nodeId),
      onOpenNote: (nodeId) => this.#openNote(nodeId),
      onGraphChange: () => this.#renderGraphChrome(),
    });

    this.#bindEvents();
    this.#renderGraphView();

    if (savedState?.ui?.screen === "note" && savedState.ui.noteContext) {
      const node = this.#workspace.getNode(savedState.ui.noteContext.graphId, savedState.ui.noteContext.nodeId);
      if (node) {
        this.#noteContext = savedState.ui.noteContext;
        this.#noteTitle.textContent = node.label;
        this.#noteEditor.setValue(node.note);
        this.#showNoteScreen();
      }
    }
  }

  seed(nodes) {
    if (this.#hasSeeded || this.#workspace.getCurrentGraph().nodes.size > 0) {
      this.#hasSeeded = true;
      return;
    }

    this.#workspace.seedRoot(nodes);
    this.#hasSeeded = true;
    this.#renderGraphView();
  }

  #bindEvents() {
    this.#breadcrumb.addEventListener("click", (event) => {
      const item = event.target.closest("[data-depth]");
      if (!item) {
        return;
      }

      this.#workspace.navigateToDepth(Number(item.dataset.depth));
      this.#renderGraphView();
    });

    this.#noteBackButton.addEventListener("click", () => {
      this.#noteContext = null;
      this.#showGraphScreen();
      this.#saveState();
    });
  }

  #openSubgraph(nodeId) {
    this.#workspace.enterSubgraph(nodeId);
    this.#noteContext = null;
    this.#renderGraphView();
    this.#saveState();
  }

  #openNote(nodeId) {
    const graph = this.#workspace.getCurrentGraph();
    const node = this.#workspace.getNode(graph.id, nodeId);
    if (!node) {
      return;
    }

    this.#noteContext = { graphId: graph.id, nodeId };
    this.#noteTitle.textContent = node.label;
    this.#noteEditor.setValue(node.note);
    this.#showNoteScreen();
    this.#saveState();
  }

  #renderGraphView() {
    this.#graphEditor.setGraph(this.#workspace.getCurrentGraph(), this.#workspace);
    this.#renderGraphChrome();
    this.#showGraphScreen();
  }

  #renderGraphChrome() {
    const crumbs = this.#workspace.getBreadcrumbs();
    this.#breadcrumb.textContent = "";

    crumbs.forEach((crumb, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "breadcrumb-item";
      button.dataset.depth = String(crumb.depth);
      button.textContent = crumb.label;
      this.#breadcrumb.append(button);

      if (index < crumbs.length - 1) {
        const separator = document.createElement("span");
        separator.className = "breadcrumb-separator";
        separator.textContent = "/";
        this.#breadcrumb.append(separator);
      }
    });

    if (this.#noteContext) {
      const node = this.#workspace.getNode(this.#noteContext.graphId, this.#noteContext.nodeId);
      if (node) {
        this.#noteTitle.textContent = node.label;
      }
    }
  }

  #showGraphScreen() {
    this.#graphScreen.classList.remove("is-hidden");
    this.#noteScreen.classList.add("is-hidden");
    this.#graphScreen.setAttribute("aria-hidden", "false");
    this.#noteScreen.setAttribute("aria-hidden", "true");
  }

  #showNoteScreen() {
    this.#graphScreen.classList.add("is-hidden");
    this.#noteScreen.classList.remove("is-hidden");
    this.#graphScreen.setAttribute("aria-hidden", "true");
    this.#noteScreen.setAttribute("aria-hidden", "false");
  }

  #persistActiveNote(value) {
    if (!this.#noteContext) {
      return;
    }

    this.#workspace.updateNode(this.#noteContext.graphId, this.#noteContext.nodeId, {
      note: value,
    });
  }

  #loadState() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  #saveState() {
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          workspace: this.#workspace.serialize(),
          ui: {
            screen: this.#noteContext ? "note" : "graph",
            noteContext: this.#noteContext,
          },
        })
      );
    } catch {
      // Ignore storage failures and keep the app usable.
    }
  }
}
