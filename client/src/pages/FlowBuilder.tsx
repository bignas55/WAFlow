import { useState, useRef, useEffect } from "react";
import {
  Plus, Trash2, Save, ChevronRight, MessageSquare,
  GitBranch, Clock, Bot, UserCheck, X,
  Download, Upload, Zap, Loader2, ToggleLeft, ToggleRight,
  CheckCircle2,
} from "lucide-react";
import { trpc } from "../lib/trpc";

// ── Types ──────────────────────────────────────────────────────────────────

type NodeType = "message" | "condition" | "delay" | "ai_reply" | "escalate" | "end";

interface FlowNode {
  id: string;
  type: NodeType;
  label: string;
  content?: string;
  conditionKey?: string;
  conditionValue?: string;
  delaySeconds?: number;
  trueNext?: string;
  falseNext?: string;
  next?: string;
  x: number;
  y: number;
}

interface Flow {
  id: string;
  name: string;
  trigger: string;
  nodes: FlowNode[];
  isActive: boolean;
  createdAt: string;
  updatedAt?: string;
}

// ── Node config ────────────────────────────────────────────────────────────

const NODE_CONFIG: Record<NodeType, { label: string; color: string; bg: string; border: string; icon: any }> = {
  message:   { label: "Send Message",   color: "text-blue-600",   bg: "bg-blue-50",   border: "border-blue-200",   icon: MessageSquare },
  condition: { label: "Condition",      color: "text-purple-600", bg: "bg-purple-50", border: "border-purple-200", icon: GitBranch },
  delay:     { label: "Wait / Delay",   color: "text-yellow-600", bg: "bg-yellow-50", border: "border-yellow-200", icon: Clock },
  ai_reply:  { label: "AI Reply",       color: "text-green-600",  bg: "bg-green-50",  border: "border-green-200",  icon: Bot },
  escalate:  { label: "Escalate",       color: "text-orange-600", bg: "bg-orange-50", border: "border-orange-200", icon: UserCheck },
  end:       { label: "End Flow",       color: "text-gray-500",   bg: "bg-gray-50",   border: "border-gray-200",   icon: X },
};

// ── Helpers ────────────────────────────────────────────────────────────────

function uid() {
  return Math.random().toString(36).slice(2, 8);
}

function makeNode(type: NodeType, x = 0, y = 0): FlowNode {
  const id = uid();
  const base: FlowNode = { id, type, label: NODE_CONFIG[type].label, x, y };
  if (type === "message")   return { ...base, content: "Hello! How can I help you today?" };
  if (type === "condition") return { ...base, conditionKey: "message", conditionValue: "", trueNext: undefined, falseNext: undefined };
  if (type === "delay")     return { ...base, delaySeconds: 30 };
  if (type === "ai_reply")  return { ...base, content: "" };
  return base;
}

const STARTER_FLOW: Flow = {
  id: uid(),
  name: "Welcome Flow",
  trigger: "hello",
  isActive: false,
  createdAt: new Date().toISOString(),
  nodes: [
    { id: "n1", type: "message",   label: "Greeting",        content: "Welcome! How can I help you today?", x: 0, y: 0, next: "n2" },
    { id: "n2", type: "condition", label: "Check keyword",   conditionKey: "message", conditionValue: "support", x: 0, y: 1, trueNext: "n3", falseNext: "n4" },
    { id: "n3", type: "escalate",  label: "Escalate to Agent", x: -1, y: 2 },
    { id: "n4", type: "ai_reply",  label: "AI handles",      x: 1, y: 2, next: "n5" },
    { id: "n5", type: "end",       label: "End Flow",        x: 1, y: 3 },
  ],
};

// ── Node Edit Panel ────────────────────────────────────────────────────────

function NodeEditor({
  node, allNodes, onChange, onClose, onDelete,
}: {
  node: FlowNode; allNodes: FlowNode[];
  onChange: (n: FlowNode) => void;
  onClose: () => void; onDelete: (id: string) => void;
}) {
  const cfg = NODE_CONFIG[node.type];
  const inputCls = "w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:border-blue-400";
  const otherNodes = allNodes.filter((n) => n.id !== node.id);

  function field(label: string, el: React.ReactNode) {
    return (
      <div>
        <label className="text-xs font-medium text-gray-500 block mb-1">{label}</label>
        {el}
      </div>
    );
  }

  return (
    <div className="w-80 flex-shrink-0 bg-white border-l border-gray-200 flex flex-col h-full shadow-lg">
      <div className={`flex items-center justify-between px-4 py-3 ${cfg.bg} border-b border-gray-100`}>
        <div className="flex items-center gap-2">
          <cfg.icon className={`w-4 h-4 ${cfg.color}`} />
          <span className={`text-sm font-semibold ${cfg.color}`}>{cfg.label}</span>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {field("Label", (
          <input className={inputCls} value={node.label}
            onChange={(e) => onChange({ ...node, label: e.target.value })} />
        ))}

        {(node.type === "message" || node.type === "ai_reply") && field("Message Content", (
          <textarea className={`${inputCls} resize-none`} rows={4}
            value={node.content ?? ""}
            onChange={(e) => onChange({ ...node, content: e.target.value })}
            placeholder={node.type === "ai_reply" ? "Leave blank to use AI persona…" : "Type your message…"} />
        ))}

        {node.type === "condition" && (<>
          {field("Check Field", (
            <select className={inputCls} value={node.conditionKey ?? "message"}
              onChange={(e) => onChange({ ...node, conditionKey: e.target.value })}>
              <option value="message">Message Text</option>
              <option value="sentiment">Sentiment</option>
              <option value="language">Language</option>
            </select>
          ))}
          {field("Contains / Equals", (
            <input className={inputCls} value={node.conditionValue ?? ""}
              onChange={(e) => onChange({ ...node, conditionValue: e.target.value })}
              placeholder="e.g. support, positive…" />
          ))}
          {field("If TRUE → go to", (
            <select className={inputCls} value={node.trueNext ?? ""}
              onChange={(e) => onChange({ ...node, trueNext: e.target.value || undefined })}>
              <option value="">— none —</option>
              {otherNodes.map((n) => <option key={n.id} value={n.id}>{n.label} ({n.type})</option>)}
            </select>
          ))}
          {field("If FALSE → go to", (
            <select className={inputCls} value={node.falseNext ?? ""}
              onChange={(e) => onChange({ ...node, falseNext: e.target.value || undefined })}>
              <option value="">— none —</option>
              {otherNodes.map((n) => <option key={n.id} value={n.id}>{n.label} ({n.type})</option>)}
            </select>
          ))}
        </>)}

        {node.type === "delay" && field("Wait Duration (seconds)", (
          <input type="number" min={1} className={inputCls} value={node.delaySeconds ?? 30}
            onChange={(e) => onChange({ ...node, delaySeconds: Number(e.target.value) })} />
        ))}

        {node.type !== "condition" && node.type !== "end" && node.type !== "escalate" && field("Next Step", (
          <select className={inputCls} value={node.next ?? ""}
            onChange={(e) => onChange({ ...node, next: e.target.value || undefined })}>
            <option value="">— none (end here) —</option>
            {otherNodes.map((n) => <option key={n.id} value={n.id}>{n.label} ({n.type})</option>)}
          </select>
        ))}
      </div>

      <div className="p-4 border-t border-gray-100">
        <button onClick={() => onDelete(node.id)}
          className="w-full flex items-center justify-center gap-2 text-sm text-red-500 hover:text-red-600 border border-red-200 hover:bg-red-50 px-3 py-2 rounded-lg transition-colors">
          <Trash2 className="w-3.5 h-3.5" /> Delete Node
        </button>
      </div>
    </div>
  );
}

// ── Node Card ──────────────────────────────────────────────────────────────

function NodeCard({ node, selected, onClick }: { node: FlowNode; selected: boolean; onClick: () => void }) {
  const cfg = NODE_CONFIG[node.type];
  return (
    <div onClick={onClick}
      className={`cursor-pointer rounded-xl border-2 p-3 min-w-[180px] transition-all select-none ${cfg.bg} ${
        selected ? `${cfg.border} ring-2 ring-offset-1 ring-blue-400` : `${cfg.border} hover:shadow-md`
      }`}>
      <div className="flex items-center gap-2 mb-1">
        <cfg.icon className={`w-4 h-4 flex-shrink-0 ${cfg.color}`} />
        <span className={`text-xs font-semibold ${cfg.color} truncate`}>{cfg.label}</span>
      </div>
      <p className="text-xs text-gray-700 truncate font-medium">{node.label}</p>
      {node.content && <p className="text-[10px] text-gray-500 mt-1 line-clamp-2 leading-tight">{node.content}</p>}
      {node.type === "delay" && <p className="text-[10px] text-gray-500 mt-1">Wait {node.delaySeconds}s</p>}
      {node.type === "condition" && (
        <p className="text-[10px] text-gray-500 mt-1 truncate">{node.conditionKey} = "{node.conditionValue}"</p>
      )}
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────

export default function FlowBuilder() {
  const utils = trpc.useUtils();

  // ── Server state ─────────────────────────────────────────────────────────
  const { data: serverFlows, isLoading } = trpc.flows.list.useQuery();
  const saveMut      = trpc.flows.save.useMutation({ onSuccess: () => utils.flows.list.invalidate() });
  const deleteMut    = trpc.flows.delete.useMutation({ onSuccess: () => utils.flows.list.invalidate() });
  const toggleMut    = trpc.flows.toggleActive.useMutation({ onSuccess: () => utils.flows.list.invalidate() });

  // ── Local state ───────────────────────────────────────────────────────────
  const [flows, setFlows]           = useState<Flow[]>([]);
  const [activeFlowId, setActiveFlowId] = useState<string>("");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [newFlowName, setNewFlowName] = useState("");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Hydrate from server ───────────────────────────────────────────────────
  useEffect(() => {
    if (!serverFlows) return;
    if (serverFlows.length > 0) {
      setFlows(serverFlows as Flow[]);
      setActiveFlowId((id) => serverFlows.find((f) => f.id === id) ? id : serverFlows[0].id);
    } else {
      // First time — seed with starter flow and save it
      setFlows([STARTER_FLOW]);
      setActiveFlowId(STARTER_FLOW.id);
      saveMut.mutate(STARTER_FLOW);
    }
  }, [serverFlows]);

  const activeFlow     = flows.find((f) => f.id === activeFlowId);
  const nodes          = activeFlow?.nodes ?? [];
  const selectedNode   = nodes.find((n) => n.id === selectedNodeId) ?? null;

  // ── Helpers ───────────────────────────────────────────────────────────────

  function updateFlow(updated: Partial<Flow>) {
    setFlows((prev) => prev.map((f) => f.id === activeFlowId ? { ...f, ...updated } : f));
  }
  function updateNode(updatedNode: FlowNode) {
    updateFlow({ nodes: nodes.map((n) => (n.id === updatedNode.id ? updatedNode : n)) });
  }
  function addNode(type: NodeType) {
    const col = (nodes.length % 3) - 1;
    const row = Math.floor(nodes.length / 3) + 1;
    updateFlow({ nodes: [...nodes, makeNode(type, col, row)] });
  }
  function deleteNode(id: string) {
    updateFlow({
      nodes: nodes.filter((n) => n.id !== id).map((n) => ({
        ...n,
        next: n.next === id ? undefined : n.next,
        trueNext: n.trueNext === id ? undefined : n.trueNext,
        falseNext: n.falseNext === id ? undefined : n.falseNext,
      })),
    });
    setSelectedNodeId(null);
  }
  function createFlow() {
    const name = newFlowName.trim() || "New Flow";
    const f: Flow = { id: uid(), name, trigger: "hi", isActive: false,
      nodes: [makeNode("message", 0, 0)], createdAt: new Date().toISOString() };
    setFlows((prev) => [...prev, f]);
    setActiveFlowId(f.id);
    setSelectedNodeId(null);
    setNewFlowName("");
    saveMut.mutate(f);
  }
  async function deleteFlow(id: string) {
    const remaining = flows.filter((f) => f.id !== id);
    setFlows(remaining);
    if (activeFlowId === id) { setActiveFlowId(remaining[0]?.id ?? ""); setSelectedNodeId(null); }
    await deleteMut.mutateAsync({ id });
  }

  // ── Save to server ────────────────────────────────────────────────────────
  async function saveCurrentFlow() {
    if (!activeFlow) return;
    setSaveStatus("saving");
    await saveMut.mutateAsync(activeFlow);
    setSaveStatus("saved");
    setTimeout(() => setSaveStatus("idle"), 2000);
  }

  // ── Toggle active ─────────────────────────────────────────────────────────
  async function toggleActive(id: string, isActive: boolean) {
    setFlows((prev) => prev.map((f) => (f.id === id ? { ...f, isActive } : f)));
    await toggleMut.mutateAsync({ id, isActive });
  }

  // ── Export / Import ────────────────────────────────────────────────────────
  function exportJSON() {
    const json = JSON.stringify(flows, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "waflow-flows.json"; a.click();
    URL.revokeObjectURL(url);
  }
  function importFlows(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const imported = JSON.parse(ev.target?.result as string) as Flow[];
        const withNewIds = imported.map((f) => ({ ...f, id: uid(), isActive: false }));
        setFlows((prev) => [...prev, ...withNewIds]);
        withNewIds.forEach((f) => saveMut.mutate(f));
      } catch {}
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  // ── Canvas ─────────────────────────────────────────────────────────────────
  function renderCanvas() {
    const rowMap: Record<number, FlowNode[]> = {};
    for (const n of nodes) {
      const row = n.y ?? 0;
      if (!rowMap[row]) rowMap[row] = [];
      rowMap[row].push(n);
    }
    const sortedRows = Object.keys(rowMap).map(Number).sort((a, b) => a - b);

    return (
      <div className="flex-1 overflow-auto p-8 bg-gray-50">
        {sortedRows.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-3">
            <GitBranch className="w-12 h-12 opacity-20" />
            <p className="text-base font-medium">No nodes yet</p>
            <p className="text-sm">Add a step using the panel on the left</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-0 w-full">
            {sortedRows.map((row, rowIdx) => (
              <div key={row}>
                {rowIdx > 0 && (
                  <div className="flex justify-center py-1">
                    <div className="flex flex-col items-center">
                      <div className="w-0.5 h-4 bg-gray-300" />
                      <ChevronRight className="w-4 h-4 text-gray-400 rotate-90 -mt-1" />
                    </div>
                  </div>
                )}
                <div className="flex items-start justify-center gap-6 flex-wrap">
                  {rowMap[row].map((node) => (
                    <div key={node.id} className="flex flex-col items-center">
                      <NodeCard
                        node={node}
                        selected={selectedNodeId === node.id}
                        onClick={() => setSelectedNodeId(node.id === selectedNodeId ? null : node.id)}
                      />
                      {node.type === "condition" && (
                        <div className="flex gap-8 mt-1 text-[10px] text-gray-400">
                          <span className="text-green-500 font-medium">✓ true</span>
                          <span className="text-red-400 font-medium">✗ false</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Loading ────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex h-[calc(100vh-48px)] -m-6 items-center justify-center bg-gray-950 text-gray-400">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-48px)] -m-6 overflow-hidden bg-gray-950">

      {/* ── Left panel ──────────────────────────────────────────────────── */}
      <div className="w-64 flex-shrink-0 flex flex-col bg-gray-900 border-r border-gray-800">
        <div className="p-4 border-b border-gray-800">
          <h1 className="text-base font-bold text-white flex items-center gap-2">
            <GitBranch className="w-4 h-4 text-[#25D366]" /> Flow Builder
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">Saved to server automatically</p>
        </div>

        {/* Flow list */}
        <div className="p-3 border-b border-gray-800 space-y-1 max-h-64 overflow-y-auto">
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Flows</p>
          {flows.map((f) => (
            <div key={f.id}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer group transition-colors ${
                f.id === activeFlowId ? "bg-[#25D366]/10 border border-[#25D366]/20" : "hover:bg-gray-800"
              }`}
              onClick={() => { setActiveFlowId(f.id); setSelectedNodeId(null); }}>
              <Zap className={`w-3.5 h-3.5 flex-shrink-0 ${f.id === activeFlowId ? "text-[#25D366]" : "text-gray-500"}`} />
              <span className={`text-xs flex-1 truncate font-medium ${f.id === activeFlowId ? "text-[#25D366]" : "text-gray-300"}`}>
                {f.name}
              </span>
              {f.isActive && (
                <span className="text-[9px] bg-[#25D366]/20 text-[#25D366] px-1.5 py-0.5 rounded-full font-medium">ON</span>
              )}
              {flows.length > 1 && (
                <button onClick={(e) => { e.stopPropagation(); deleteFlow(f.id); }}
                  className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 transition-colors">
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          ))}
          {/* New flow */}
          <div className="flex gap-1 mt-2">
            <input value={newFlowName} onChange={(e) => setNewFlowName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createFlow()}
              placeholder="New flow name…"
              className="flex-1 bg-gray-800 text-gray-200 placeholder-gray-600 rounded-lg px-2 py-1.5 text-xs border border-gray-700 focus:outline-none focus:border-[#25D366]" />
            <button onClick={createFlow}
              className="w-7 h-7 flex items-center justify-center bg-[#25D366] hover:bg-[#20ba57] rounded-lg flex-shrink-0">
              <Plus className="w-4 h-4 text-white" />
            </button>
          </div>
        </div>

        {/* Node palette */}
        <div className="p-3 flex-1 overflow-y-auto">
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Add Step</p>
          <div className="space-y-1.5">
            {(Object.entries(NODE_CONFIG) as [NodeType, typeof NODE_CONFIG[NodeType]][]).map(([type, cfg]) => (
              <button key={type} onClick={() => addNode(type)}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-colors ${cfg.bg} border ${cfg.border} hover:opacity-90 group`}>
                <cfg.icon className={`w-4 h-4 flex-shrink-0 ${cfg.color}`} />
                <span className={`text-xs font-medium ${cfg.color}`}>{cfg.label}</span>
                <Plus className="w-3 h-3 ml-auto text-gray-400 opacity-0 group-hover:opacity-100" />
              </button>
            ))}
          </div>
        </div>

        {/* Bottom actions */}
        <div className="p-3 border-t border-gray-800 flex gap-1.5">
          <button onClick={exportJSON}
            className="flex items-center justify-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors"
            title="Export as JSON">
            <Download className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => fileInputRef.current?.click()}
            className="flex items-center justify-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors"
            title="Import from JSON">
            <Upload className="w-3.5 h-3.5" />
          </button>
          <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={importFlows} />
        </div>
      </div>

      {/* ── Center: canvas ───────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 bg-gray-50">
        {activeFlow && (
          <div className="flex items-center gap-3 px-5 py-3 bg-white border-b border-gray-200 flex-shrink-0">
            <div className="flex-1 min-w-0">
              <input value={activeFlow.name}
                onChange={(e) => updateFlow({ name: e.target.value })}
                className="text-sm font-bold text-gray-800 bg-transparent focus:outline-none border-b border-transparent focus:border-blue-400 w-full" />
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[10px] text-gray-400">Trigger keyword:</span>
                <input value={activeFlow.trigger}
                  onChange={(e) => updateFlow({ trigger: e.target.value })}
                  placeholder="e.g. hello, support"
                  className="text-xs text-blue-600 bg-transparent focus:outline-none border-b border-transparent focus:border-blue-400" />
              </div>
            </div>

            {/* Active toggle */}
            <button onClick={() => toggleActive(activeFlow.id, !activeFlow.isActive)}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors"
              style={activeFlow.isActive
                ? { borderColor: "#25D366", color: "#25D366", background: "rgba(37,211,102,0.07)" }
                : { borderColor: "#d1d5db", color: "#6b7280" }}>
              {activeFlow.isActive
                ? <><ToggleRight className="w-4 h-4" /> Active</>
                : <><ToggleLeft className="w-4 h-4" /> Inactive</>}
            </button>

            {/* Save button */}
            <button onClick={saveCurrentFlow} disabled={saveStatus === "saving"}
              className={`flex items-center gap-1.5 text-xs font-semibold px-4 py-1.5 rounded-lg transition-colors ${
                saveStatus === "saved"
                  ? "bg-green-600 text-white"
                  : "bg-[#25D366] hover:bg-[#20ba57] text-white"
              }`}>
              {saveStatus === "saving"
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Saving…</>
                : saveStatus === "saved"
                ? <><CheckCircle2 className="w-3.5 h-3.5" />Saved!</>
                : <><Save className="w-3.5 h-3.5" />Save</>}
            </button>

            <span className="bg-gray-100 text-gray-500 text-xs px-2 py-0.5 rounded-full">{nodes.length} nodes</span>
          </div>
        )}
        {renderCanvas()}
      </div>

      {/* ── Right: node editor ───────────────────────────────────────────── */}
      {selectedNode && (
        <NodeEditor node={selectedNode} allNodes={nodes}
          onChange={updateNode}
          onClose={() => setSelectedNodeId(null)}
          onDelete={deleteNode} />
      )}
    </div>
  );
}
