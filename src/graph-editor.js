import { clamp, buildCurvePath, selectClosestAnchor } from "./geometry.js";

export class GraphEditor {
  #board;
  #nodesLayer;
  #edgesLayer;
  #nodeTemplate;
  #graph = null;
  #workspace = null;
  #nodeViews = new Map();
  #edgeViews = new Map();
  #dragSession = null;
  #connectionSession = null;
  #onOpenSubgraph;
  #onOpenNote;
  #onGraphChange;

  constructor({ board, nodesLayer, edgesLayer, nodeTemplate, onOpenSubgraph, onOpenNote, onGraphChange }) {
    this.#board = board;
    this.#nodesLayer = nodesLayer;
    this.#edgesLayer = edgesLayer;
    this.#nodeTemplate = nodeTemplate;
    this.#onOpenSubgraph = onOpenSubgraph;
    this.#onOpenNote = onOpenNote;
    this.#onGraphChange = onGraphChange;

    this.#bindBoardEvents();
    window.addEventListener("resize", () => this.#renderEdges());
  }

  setGraph(graph, workspace) {
    this.#graph = graph;
    this.#workspace = workspace;
    this.#dragSession = null;
    this.#connectionSession = null;
    this.#nodeViews.clear();
    this.#edgeViews.clear();
    this.#nodesLayer.textContent = "";
    this.#edgesLayer.querySelectorAll("path").forEach((path) => {
      if (!path.closest("defs")) {
        path.remove();
      }
    });

    for (const node of this.#graph.nodes.values()) {
      this.#mountNode(node);
    }

    for (const edge of this.#graph.edges) {
      this.#edgeViews.set(this.#edgeKey(edge.from, edge.to), this.#createPath());
    }

    this.#renderEdges();
  }

  #bindBoardEvents() {
    this.#board.addEventListener("click", (event) => {
      if (event.target.closest("[data-node]")) {
        return;
      }

      if (!this.#graph || this.#dragSession || this.#connectionSession) {
        return;
      }

      const point = this.#getBoardPoint(event.clientX, event.clientY);
      const node = this.#workspace.createNode(this.#graph.id, {
        x: point.x,
        y: point.y,
        label: `Node ${this.#graph.nodes.size + 1}`,
      });

      this.#mountNode(node);
      this.#positionNode(node.id);
      this.#startEditing(node.id);
      this.#onGraphChange?.();
    });

    document.addEventListener("pointermove", (event) => {
      if (this.#dragSession) {
        this.#updateDrag(event.clientX, event.clientY);
      }

      if (this.#connectionSession) {
        this.#connectionSession.toPoint = this.#getBoardPoint(event.clientX, event.clientY);
        this.#renderEdges();
      }
    });

    document.addEventListener("pointerup", (event) => {
      this.#finishDrag();
      this.#finishConnection(event.clientX, event.clientY);
    });
  }

  #mountNode(node) {
    const fragment = this.#nodeTemplate.content.cloneNode(true);
    const element = fragment.querySelector("[data-node]");
    const body = fragment.querySelector("[data-body]");
    const label = fragment.querySelector("[data-label]");
    const input = fragment.querySelector("[data-input]");
    const menu = fragment.querySelector("[data-menu]");
    const connector = fragment.querySelector("[data-connector]");
    const openGraphButton = fragment.querySelector("[data-open-graph]");
    const openNoteButton = fragment.querySelector("[data-open-note]");

    element.dataset.id = node.id;
    label.textContent = node.label;
    input.value = node.label;

    body.addEventListener("pointerdown", (event) => this.#handleNodePointerDown(event, node.id));
    body.addEventListener("click", (event) => this.#handleNodeClick(event, node.id));
    element.addEventListener("contextmenu", (event) => this.#handleNodeContextMenu(event, node.id));

    input.addEventListener("input", () => this.#handleLabelInput(node.id, input.value));
    input.addEventListener("blur", () => this.#commitEditing(node.id, true));
    input.addEventListener("keydown", (event) => this.#handleInputKeydown(event, node.id));

    menu.addEventListener("click", (event) => event.stopPropagation());
    openGraphButton.addEventListener("click", (event) => {
      event.stopPropagation();
      this.#onOpenSubgraph?.(node.id);
    });
    openNoteButton.addEventListener("click", (event) => {
      event.stopPropagation();
      this.#onOpenNote?.(node.id);
    });
    menu.querySelectorAll("[data-color]").forEach((button) => {
      button.addEventListener("click", () => this.#setNodeColor(node.id, button.dataset.color));
    });
    menu.querySelector("[data-clear-color]").addEventListener("click", () => this.#clearNodeColor(node.id));
    connector.addEventListener("pointerdown", (event) => this.#startConnection(event, node.id));

    this.#nodesLayer.append(fragment);
    this.#nodeViews.set(node.id, { element, body, label, input, connector });
    this.#applyNodeColor(node.id);
    element.style.left = `${node.x}px`;
    element.style.top = `${node.y}px`;
  }

  #handleNodePointerDown(event, nodeId) {
    if (event.button !== 0 || event.target.closest("[data-menu]")) {
      return;
    }

    const view = this.#nodeViews.get(nodeId);
    if (view.element.classList.contains("editing")) {
      return;
    }

    const node = this.#graph.nodes.get(nodeId);
    const point = this.#getBoardPoint(event.clientX, event.clientY);

    this.#dragSession = {
      nodeId,
      offsetX: point.x - node.x,
      offsetY: point.y - node.y,
      moved: false,
    };

    view.element.classList.add("dragging");
    view.body.setPointerCapture(event.pointerId);
  }

  #handleNodeClick(event, nodeId) {
    if (this.#dragSession) {
      return;
    }

    const node = this.#graph.nodes.get(nodeId);
    if (node.justDragged) {
      node.justDragged = false;
      return;
    }

    event.stopPropagation();
    this.#startEditing(nodeId);
  }

  #handleNodeContextMenu(event, nodeId) {
    event.preventDefault();
    event.stopPropagation();
    this.#removeNode(nodeId);
  }

  #handleLabelInput(nodeId, nextValue) {
    this.#nodeViews.get(nodeId).label.textContent = nextValue.trim() || "Node";
    this.#renderEdges();
  }

  #handleInputKeydown(event, nodeId) {
    if (event.key === "Enter") {
      event.preventDefault();
      this.#commitEditing(nodeId, true);
      this.#nodeViews.get(nodeId).input.blur();
    }

    if (event.key === "Escape") {
      event.preventDefault();
      this.#commitEditing(nodeId, false);
      this.#nodeViews.get(nodeId).input.blur();
    }
  }

  #startEditing(nodeId) {
    if (this.#dragSession || this.#connectionSession) {
      return;
    }

    const node = this.#graph.nodes.get(nodeId);
    const view = this.#nodeViews.get(nodeId);

    view.input.dataset.initialValue = node.label;
    view.element.classList.add("editing");
    view.input.value = node.label;
    view.input.focus();
    view.input.select();
  }

  #commitEditing(nodeId, shouldPersist) {
    const node = this.#graph.nodes.get(nodeId);
    const view = this.#nodeViews.get(nodeId);
    if (!node || !view || !view.element.classList.contains("editing")) {
      return;
    }

    const finalLabel = shouldPersist
      ? view.input.value.trim() || "Node"
      : view.input.dataset.initialValue || node.label;

    this.#workspace.updateNode(this.#graph.id, nodeId, { label: finalLabel });
    view.label.textContent = finalLabel;
    view.input.value = finalLabel;
    view.element.classList.remove("editing");
    this.#renderEdges();
    this.#onGraphChange?.();
  }

  #setNodeColor(nodeId, color) {
    this.#workspace.updateNode(this.#graph.id, nodeId, { color });
    this.#workspace.setActiveColor(this.#graph.id, color);
    this.#applyNodeColor(nodeId);
  }

  #clearNodeColor(nodeId) {
    this.#workspace.updateNode(this.#graph.id, nodeId, { color: null });
    this.#applyNodeColor(nodeId);
  }

  #removeNode(nodeId) {
    const removedNode = this.#workspace.removeNode(this.#graph.id, nodeId);
    if (!removedNode) {
      return;
    }

    const view = this.#nodeViews.get(nodeId);
    view?.element.remove();
    this.#nodeViews.delete(nodeId);

    for (const [edgeKey, edgePath] of this.#edgeViews) {
      const [fromId, toId] = edgeKey.split(":");
      if (fromId === nodeId || toId === nodeId) {
        edgePath.remove();
        this.#edgeViews.delete(edgeKey);
      }
    }

    this.#renderEdges();
    this.#onGraphChange?.();
  }

  #startConnection(event, nodeId) {
    event.preventDefault();
    event.stopPropagation();

    const sourceView = this.#nodeViews.get(nodeId);
    sourceView.connector.setPointerCapture(event.pointerId);
    sourceView.element.classList.add("menu-open");

    this.#connectionSession = {
      fromId: nodeId,
      toPoint: this.#getBoardPoint(event.clientX, event.clientY),
      previewPath: this.#createPath("connection-preview"),
    };

    this.#renderEdges();
  }

  #finishConnection(clientX, clientY) {
    if (!this.#connectionSession) {
      return;
    }

    const targetNode = this.#findNodeAt(clientX, clientY);
    if (targetNode) {
      const edgeAdded = this.#workspace.addEdge(this.#graph.id, this.#connectionSession.fromId, targetNode.id);
      if (edgeAdded) {
        this.#edgeViews.set(
          this.#edgeKey(this.#connectionSession.fromId, targetNode.id),
          this.#createPath()
        );
      }
    }

    this.#nodeViews.get(this.#connectionSession.fromId)?.element.classList.remove("menu-open");
    this.#connectionSession.previewPath.remove();
    this.#connectionSession = null;
    this.#renderEdges();
  }

  #updateDrag(clientX, clientY) {
    const session = this.#dragSession;
    const node = this.#graph.nodes.get(session.nodeId);
    const view = this.#nodeViews.get(session.nodeId);
    const boardRect = this.#board.getBoundingClientRect();
    const nodeRect = view.element.getBoundingClientRect();
    const point = this.#getBoardPoint(clientX, clientY);
    const nextX = clamp(point.x - session.offsetX, nodeRect.width / 2, boardRect.width - nodeRect.width / 2);
    const nextY = clamp(point.y - session.offsetY, nodeRect.height / 2, boardRect.height - nodeRect.height / 2);

    if (Math.abs(nextX - node.x) > 0.5 || Math.abs(nextY - node.y) > 0.5) {
      session.moved = true;
    }

    this.#workspace.updateNode(this.#graph.id, session.nodeId, { x: nextX, y: nextY });
    this.#positionNode(session.nodeId);
  }

  #finishDrag() {
    if (!this.#dragSession) {
      return;
    }

    const session = this.#dragSession;
    const node = this.#graph.nodes.get(session.nodeId);
    const view = this.#nodeViews.get(session.nodeId);

    node.justDragged = session.moved;
    view.element.classList.remove("dragging");
    this.#dragSession = null;
  }

  #positionNode(nodeId) {
    const node = this.#graph.nodes.get(nodeId);
    const view = this.#nodeViews.get(nodeId);
    view.element.style.left = `${node.x}px`;
    view.element.style.top = `${node.y}px`;
    this.#renderEdges();
  }

  #applyNodeColor(nodeId) {
    const node = this.#graph.nodes.get(nodeId);
    const view = this.#nodeViews.get(nodeId);
    view.element.style.setProperty("--node-bg", node.color ?? "transparent");
  }

  #renderEdges() {
    if (!this.#graph) {
      return;
    }

    for (const edge of this.#graph.edges) {
      const edgeView = this.#edgeViews.get(this.#edgeKey(edge.from, edge.to));
      edgeView?.setAttribute("d", this.#describeEdge(edge.from, edge.to));
    }

    if (this.#connectionSession) {
      this.#connectionSession.previewPath.setAttribute(
        "d",
        this.#describePreview(this.#connectionSession.fromId, this.#connectionSession.toPoint)
      );
    }
  }

  #describeEdge(fromId, toId) {
    const fromMetrics = this.#measureNode(fromId);
    const toMetrics = this.#measureNode(toId);
    const fromAnchor = selectClosestAnchor(fromMetrics, { x: toMetrics.centerX, y: toMetrics.centerY });
    const toAnchor = selectClosestAnchor(toMetrics, { x: fromMetrics.centerX, y: fromMetrics.centerY });
    return buildCurvePath(fromAnchor, toAnchor);
  }

  #describePreview(fromId, toPoint) {
    const fromMetrics = this.#measureNode(fromId);
    return buildCurvePath(
      selectClosestAnchor(fromMetrics, toPoint),
      { x: toPoint.x, y: toPoint.y, normalX: 0, normalY: 0 }
    );
  }

  #measureNode(nodeId) {
    const nodeRect = this.#nodeViews.get(nodeId).element.getBoundingClientRect();
    const boardRect = this.#board.getBoundingClientRect();

    return {
      left: nodeRect.left - boardRect.left,
      right: nodeRect.right - boardRect.left,
      top: nodeRect.top - boardRect.top,
      bottom: nodeRect.bottom - boardRect.top,
      centerX: nodeRect.left - boardRect.left + nodeRect.width / 2,
      centerY: nodeRect.top - boardRect.top + nodeRect.height / 2,
    };
  }

  #findNodeAt(clientX, clientY) {
    const element = document.elementFromPoint(clientX, clientY)?.closest("[data-node]");
    return element ? this.#graph.nodes.get(element.dataset.id) : null;
  }

  #getBoardPoint(clientX, clientY) {
    const rect = this.#board.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  #edgeKey(fromId, toId) {
    return `${fromId}:${toId}`;
  }

  #createPath(className = "") {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    if (className) {
      path.setAttribute("class", className);
    }

    this.#edgesLayer.append(path);
    return path;
  }
}
