export class WorkspaceState {
  #nextGraphId = 1;
  #nextNodeId = 1;
  #graphs = new Map();
  #path = [];
  #onChange;

  constructor({ snapshot = null, onChange = null } = {}) {
    this.#onChange = onChange;

    if (snapshot) {
      this.#hydrate(snapshot);
      return;
    }

    const rootGraph = this.#createGraph();
    this.#path = [{ graphId: rootGraph.id, parentGraphId: null, viaNodeId: null }];
  }

  seedRoot(nodes) {
    const rootGraph = this.getCurrentGraph();
    nodes.forEach((node) => this.createNode(rootGraph.id, node));
  }

  getCurrentGraph() {
    return this.#graphs.get(this.#path.at(-1).graphId);
  }

  getNode(graphId, nodeId) {
    return this.#graphs.get(graphId)?.nodes.get(nodeId) ?? null;
  }

  getBreadcrumbs() {
    return this.#path.map((segment, depth) => {
      if (depth === 0) {
        return { depth, label: "Main" };
      }

      const parentNode = this.getNode(segment.parentGraphId, segment.viaNodeId);
      return { depth, label: parentNode?.label ?? "Node" };
    });
  }

  navigateToDepth(depth) {
    this.#path = this.#path.slice(0, depth + 1);
    this.#commit();
    return this.getCurrentGraph();
  }

  enterSubgraph(nodeId) {
    const currentGraph = this.getCurrentGraph();
    const node = currentGraph.nodes.get(nodeId);
    if (!node) {
      return null;
    }

    if (!node.childGraphId) {
      node.childGraphId = this.#createGraph().id;
    }

    this.#path.push({
      graphId: node.childGraphId,
      parentGraphId: currentGraph.id,
      viaNodeId: node.id,
    });

    this.#commit();
    return this.getCurrentGraph();
  }

  createNode(graphId, { x, y, label }) {
    const graph = this.#graphs.get(graphId);
    const node = {
      id: String(this.#nextNodeId++),
      x,
      y,
      label,
      color: graph.activeColor,
      note: "",
      childGraphId: null,
      justDragged: false,
    };

    graph.nodes.set(node.id, node);
    this.#commit();
    return node;
  }

  updateNode(graphId, nodeId, updates) {
    const node = this.getNode(graphId, nodeId);
    if (!node) {
      return null;
    }

    Object.assign(node, updates);
    this.#commit();
    return node;
  }

  removeNode(graphId, nodeId) {
    const graph = this.#graphs.get(graphId);
    const node = graph.nodes.get(nodeId);
    if (!node) {
      return null;
    }

    graph.nodes.delete(nodeId);
    graph.edges = graph.edges.filter((edge) => edge.from !== nodeId && edge.to !== nodeId);
    this.#commit();
    return node;
  }

  addEdge(graphId, fromId, toId) {
    const graph = this.#graphs.get(graphId);
    if (fromId === toId) {
      return false;
    }

    const exists = graph.edges.some((edge) => edge.from === fromId && edge.to === toId);
    if (exists) {
      return false;
    }

    graph.edges.push({ from: fromId, to: toId });
    this.#commit();
    return true;
  }

  setActiveColor(graphId, color) {
    this.#graphs.get(graphId).activeColor = color;
    this.#commit();
  }

  serialize() {
    return {
      nextGraphId: this.#nextGraphId,
      nextNodeId: this.#nextNodeId,
      path: this.#path.map((segment) => ({ ...segment })),
      graphs: Array.from(this.#graphs.values()).map((graph) => ({
        id: graph.id,
        activeColor: graph.activeColor,
        edges: graph.edges.map((edge) => ({ ...edge })),
        nodes: Array.from(graph.nodes.values()).map((node) => ({ ...node })),
      })),
    };
  }

  #createGraph() {
    const graph = {
      id: String(this.#nextGraphId++),
      nodes: new Map(),
      edges: [],
      activeColor: null,
    };

    this.#graphs.set(graph.id, graph);
    return graph;
  }

  #hydrate(snapshot) {
    this.#nextGraphId = snapshot.nextGraphId;
    this.#nextNodeId = snapshot.nextNodeId;
    this.#path = snapshot.path.map((segment) => ({ ...segment }));
    this.#graphs = new Map(
      snapshot.graphs.map((graph) => [
        graph.id,
        {
          id: graph.id,
          activeColor: graph.activeColor ?? null,
          edges: graph.edges.map((edge) => ({ ...edge })),
          nodes: new Map(graph.nodes.map((node) => [node.id, { ...node }])),
        },
      ])
    );
  }

  #commit() {
    this.#onChange?.(this.serialize());
  }
}
