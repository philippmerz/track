import { WorkspaceApp } from "./src/workspace-app.js";

const app = new WorkspaceApp({
  board: document.querySelector("#board"),
  nodesLayer: document.querySelector("#nodes"),
  edgesLayer: document.querySelector("#edges"),
  nodeTemplate: document.querySelector("#node-template"),
  breadcrumb: document.querySelector("#breadcrumb"),
  graphScreen: document.querySelector("#graph-screen"),
  noteScreen: document.querySelector("#note-screen"),
  noteBackButton: document.querySelector("#note-back"),
  noteTitle: document.querySelector("#note-title"),
  noteEditorRoot: document.querySelector("#note-editor"),
});

app.seed([
  { x: 180, y: 140, label: "Subject" },
  { x: 420, y: 240, label: "Signal" },
  { x: 700, y: 180, label: "Action" },
]);
