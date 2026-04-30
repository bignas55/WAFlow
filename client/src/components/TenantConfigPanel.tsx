import { useState, useEffect } from "react";
import { X, Settings, MessageSquare, FileText, Clock, Menu } from "lucide-react";
import { trpc } from "../lib/trpc";

type TabType = "ai" | "templates" | "knowledge-base" | "business-hours" | "menu";

interface TenantConfigPanelProps {
  tenantId: number;
  isOpen: boolean;
  onClose: () => void;
}

const TABS = [
  { id: "ai", label: "AI & Prompt", icon: MessageSquare },
  { id: "templates", label: "Templates", icon: FileText },
  { id: "knowledge-base", label: "Knowledge Base", icon: FileText },
  { id: "business-hours", label: "Business Hours", icon: Clock },
  { id: "menu", label: "Menu Automation", icon: Menu },
];

export default function TenantConfigPanel({ tenantId, isOpen, onClose }: TenantConfigPanelProps) {
  const [activeTab, setActiveTab] = useState<TabType>("ai");
  const [aiForm, setAiForm] = useState({
    systemPrompt: "",
    aiModel: "gemma4:latest",
  });

  const { data: botConfig } = trpc.botConfig.get.useQuery(
    { tenantId },
    { enabled: isOpen && !!tenantId }
  );

  const updateAIMutation = trpc.admin.updateTenantConfig.useMutation({
    onSuccess: () => {
      // Optionally show success message
    },
  });

  // Load AI config when panel opens
  useEffect(() => {
    if (botConfig) {
      setAiForm({
        systemPrompt: botConfig.systemPrompt || "",
        aiModel: botConfig.aiModel || "gemma4:latest",
      });
    }
  }, [botConfig, isOpen]);

  const handleSaveAI = () => {
    if (!aiForm.systemPrompt.trim()) return;
    updateAIMutation.mutate({
      tenantId,
      systemPrompt: aiForm.systemPrompt.trim(),
      aiModel: aiForm.aiModel.trim(),
    });
  };

  return (
    <>
      {/* Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Side Panel */}
      <div
        className={`fixed top-0 right-0 h-screen w-full max-w-2xl bg-gray-900 border-l border-gray-800 z-50 transition-transform duration-300 ease-out overflow-y-auto ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="sticky top-0 bg-gray-900 border-b border-gray-800 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Settings className="w-5 h-5 text-[#25D366]" />
            <h2 className="text-lg font-semibold text-white">Tenant Configuration</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-800 bg-gray-900/50 px-6 sticky top-14 z-40">
          <div className="flex gap-1 overflow-x-auto">
            {TABS.map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as TabType)}
                  className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors whitespace-nowrap text-sm font-medium ${
                    isActive
                      ? "border-[#25D366] text-white"
                      : "border-transparent text-gray-400 hover:text-gray-300"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* AI & Prompt Tab */}
          {activeTab === "ai" && (
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-semibold text-white mb-2">
                  System Prompt <span className="text-red-400">*</span>
                </label>
                <textarea
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-[#25D366] transition-colors resize-none"
                  rows={6}
                  value={aiForm.systemPrompt}
                  onChange={e => setAiForm(f => ({ ...f, systemPrompt: e.target.value }))}
                  placeholder="Define how your AI receptionist should behave. Use {businessName} to reference the business name..."
                />
                <p className="text-xs text-gray-500 mt-2">
                  Instructions for the AI on how to respond to customers. You can use {'{businessName}'} as a placeholder.
                </p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-white mb-2">
                  AI Model
                </label>
                <select
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-[#25D366] transition-colors"
                  value={aiForm.aiModel}
                  onChange={e => setAiForm(f => ({ ...f, aiModel: e.target.value }))}
                >
                  <option value="gemma4:latest">Gemma 4 (Latest)</option>
                  <option value="llama3.2">Llama 3.2</option>
                  <option value="mistral">Mistral</option>
                  <option value="gpt-4o-mini">GPT-4o Mini</option>
                </select>
                <p className="text-xs text-gray-500 mt-2">
                  API endpoint and key are configured automatically
                </p>
              </div>

              <div className="flex gap-3 pt-4 border-t border-gray-800">
                <button
                  onClick={onClose}
                  className="flex-1 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium rounded-lg transition-colors"
                >
                  Close
                </button>
                <button
                  onClick={handleSaveAI}
                  disabled={!aiForm.systemPrompt.trim() || updateAIMutation.isPending}
                  className="flex-1 py-2.5 bg-[#25D366] hover:bg-[#20ba57] disabled:opacity-60 text-white font-medium rounded-lg transition-colors"
                >
                  {updateAIMutation.isPending ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </div>
          )}

          {/* Templates Tab */}
          {activeTab === "templates" && (
            <div className="text-center py-12">
              <FileText className="w-12 h-12 text-gray-600 mx-auto mb-3" />
              <p className="text-gray-400">Templates management coming soon</p>
              <p className="text-xs text-gray-500 mt-2">Configure auto-reply templates here</p>
            </div>
          )}

          {/* Knowledge Base Tab */}
          {activeTab === "knowledge-base" && (
            <div className="text-center py-12">
              <FileText className="w-12 h-12 text-gray-600 mx-auto mb-3" />
              <p className="text-gray-400">Knowledge Base management coming soon</p>
              <p className="text-xs text-gray-500 mt-2">Upload documents and articles for AI context</p>
            </div>
          )}

          {/* Business Hours Tab */}
          {activeTab === "business-hours" && (
            <div className="text-center py-12">
              <Clock className="w-12 h-12 text-gray-600 mx-auto mb-3" />
              <p className="text-gray-400">Business Hours management coming soon</p>
              <p className="text-xs text-gray-500 mt-2">Set operating hours and after-hours responses</p>
            </div>
          )}

          {/* Menu Automation Tab */}
          {activeTab === "menu" && (
            <div className="text-center py-12">
              <Menu className="w-12 h-12 text-gray-600 mx-auto mb-3" />
              <p className="text-gray-400">Menu Automation coming soon</p>
              <p className="text-xs text-gray-500 mt-2">Create interactive WhatsApp menus</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
