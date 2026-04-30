import React, { useState } from "react";
import { trpc } from "../lib/trpc";
import { Copy, Check, ChevronLeft } from "lucide-react";

interface PromptGeneratorProps {
  onSave?: (prompt: string) => void;
}

export const SystemPromptGenerator: React.FC<PromptGeneratorProps> = ({
  onSave,
}) => {
  const [step, setStep] = useState<"config" | "preview" | "edit">("config");
  const [generatedPrompt, setGeneratedPrompt] = useState("");
  const [editedPrompt, setEditedPrompt] = useState("");
  const [copied, setCopied] = useState(false);

  // Form state
  const [businessName, setBusinessName] = useState("");
  const [businessDescription, setBusinessDescription] = useState("");
  const [userInstructions, setUserInstructions] = useState("");
  const [tone, setTone] = useState<
    "professional" | "friendly" | "casual" | "formal"
  >("professional");
  const [language, setLanguage] = useState("en");

  // KB and URL state
  const [selectedKbIds, setSelectedKbIds] = useState<number[]>([]);
  const [urlInput, setUrlInput] = useState("");
  const [extractedContent, setExtractedContent] = useState("");
  const [extractionLoading, setExtractionLoading] = useState(false);

  // API calls
  const { data: kbArticles } = trpc.systemPrompt.listKbArticles.useQuery();
  const generateMutation = trpc.systemPrompt.generatePrompt.useMutation();
  const fetchUrlMutation = trpc.systemPrompt.fetchUrl.useMutation();
  const saveMutation = trpc.systemPrompt.savePrompt.useMutation();

  // Extract content from URL
  const handleExtractUrl = async () => {
    if (!urlInput.trim()) {
      alert("Please enter a valid URL");
      return;
    }

    setExtractionLoading(true);
    try {
      const result = await fetchUrlMutation.mutateAsync({ url: urlInput });
      if (result.success && result.content) {
        setExtractedContent(
          (prev) =>
            prev +
            `\n\n[From: ${result.title || urlInput}]\n${result.content}`
        );
        setUrlInput("");
      } else {
        alert(result.error || "Failed to extract content");
      }
    } catch (error: any) {
      alert(error.message || "Failed to extract content");
    } finally {
      setExtractionLoading(false);
    }
  };

  // Generate prompt
  const handleGenerate = async () => {
    try {
      const result = await generateMutation.mutateAsync({
        businessName: businessName || "My Business",
        businessDescription,
        kbArticleIds: selectedKbIds,
        extractedContent,
        userInstructions,
        tone,
        language,
      });

      if (result.success) {
        setGeneratedPrompt(result.prompt);
        setEditedPrompt(result.prompt);
        setStep("preview");
      } else {
        alert(result.error || "Failed to generate prompt");
      }
    } catch (error: any) {
      alert(error.message || "Error generating prompt");
    }
  };

  // Save prompt
  const handleSave = async () => {
    try {
      const result = await saveMutation.mutateAsync({
        prompt: editedPrompt,
      });
      if (result.success) {
        alert("System prompt saved successfully");
        onSave?.(editedPrompt);
        setStep("config");
        setGeneratedPrompt("");
        setEditedPrompt("");
      } else {
        alert(result.error || "Failed to save prompt");
      }
    } catch (error: any) {
      alert(error.message || "Error saving prompt");
    }
  };

  // ── Configuration Step ──
  if (step === "config") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white rounded-lg shadow-lg p-8">
            <h2 className="text-3xl font-bold mb-2 text-slate-900">
              System Prompt Generator
            </h2>
            <p className="text-slate-600 mb-8">
              Create a powerful AI system prompt by combining your knowledge base,
              website content, and custom instructions
            </p>

            <div className="space-y-8">
              {/* Business Info */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Business Name
                </label>
                <input
                  type="text"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder="Your business name"
                  className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Business Description
                </label>
                <textarea
                  value={businessDescription}
                  onChange={(e) => setBusinessDescription(e.target.value)}
                  placeholder="What does your business do?"
                  rows={3}
                  className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                />
              </div>

              {/* Knowledge Base Selection */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-3">
                  Select Knowledge Base Articles
                </label>
                <div className="border border-slate-200 rounded-lg p-4 max-h-48 overflow-y-auto space-y-2 bg-slate-50">
                  {kbArticles?.length === 0 ? (
                    <p className="text-slate-500 text-sm">
                      No knowledge base articles found
                    </p>
                  ) : (
                    kbArticles?.map((article) => (
                      <label
                        key={article.id}
                        className="flex items-center cursor-pointer hover:bg-slate-100 p-2 rounded transition"
                      >
                        <input
                          type="checkbox"
                          checked={selectedKbIds.includes(article.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedKbIds([...selectedKbIds, article.id]);
                            } else {
                              setSelectedKbIds(
                                selectedKbIds.filter((id) => id !== article.id)
                              );
                            }
                          }}
                          className="w-4 h-4 text-blue-600 rounded cursor-pointer"
                        />
                        <span className="text-sm text-slate-700 ml-3">
                          {article.title}
                          <span className="text-slate-500 text-xs ml-2">
                            ({article.category})
                          </span>
                        </span>
                      </label>
                    ))
                  )}
                </div>
              </div>

              {/* URL/Content Extraction */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-3">
                  Add Content from Website or Social Media
                </label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    placeholder="https://example.com or social media link"
                    className="flex-1 px-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                  />
                  <button
                    onClick={handleExtractUrl}
                    disabled={extractionLoading}
                    className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition"
                  >
                    {extractionLoading ? "Extracting..." : "Extract"}
                  </button>
                </div>

                {extractedContent && (
                  <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <p className="text-sm font-semibold text-slate-700 mb-2">
                      Extracted Content Preview:
                    </p>
                    <p className="text-sm text-slate-700 max-h-24 overflow-y-auto whitespace-pre-wrap font-mono text-xs">
                      {extractedContent.substring(0, 300)}...
                    </p>
                    <button
                      onClick={() => setExtractedContent("")}
                      className="text-sm text-red-600 hover:text-red-700 font-medium mt-2 transition"
                    >
                      Clear
                    </button>
                  </div>
                )}
              </div>

              {/* Additional Instructions */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Additional Instructions
                </label>
                <textarea
                  value={userInstructions}
                  onChange={(e) => setUserInstructions(e.target.value)}
                  placeholder="Any specific instructions for the AI?"
                  rows={3}
                  className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                />
              </div>

              {/* Tone and Language */}
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Tone
                  </label>
                  <select
                    value={tone}
                    onChange={(e) =>
                      setTone(e.target.value as any)
                    }
                    className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                  >
                    <option value="professional">Professional</option>
                    <option value="friendly">Friendly</option>
                    <option value="casual">Casual</option>
                    <option value="formal">Formal</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Language
                  </label>
                  <select
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                  >
                    <option value="en">English</option>
                    <option value="es">Spanish</option>
                    <option value="fr">French</option>
                    <option value="de">German</option>
                    <option value="pt">Portuguese</option>
                    <option value="ja">Japanese</option>
                    <option value="zh">Chinese</option>
                  </select>
                </div>
              </div>

              {/* Generate Button */}
              <button
                onClick={handleGenerate}
                disabled={generateMutation.isPending}
                className="w-full px-6 py-4 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-lg hover:from-green-600 hover:to-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed font-semibold transition transform hover:scale-105"
              >
                {generateMutation.isPending
                  ? "Generating..."
                  : "🚀 Generate Prompt with AI"}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Preview Step ──
  if (step === "preview") {
    const handleCopy = () => {
      navigator.clipboard.writeText(generatedPrompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    };

    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white rounded-lg shadow-lg p-8">
            <h2 className="text-3xl font-bold mb-6 text-slate-900">
              Generated System Prompt
            </h2>

            <div className="bg-slate-50 border border-slate-200 p-6 rounded-lg mb-8 max-h-96 overflow-y-auto">
              <p className="text-sm font-semibold text-slate-700 mb-3">
                Preview:
              </p>
              <p className="text-sm text-slate-800 whitespace-pre-wrap font-mono text-xs leading-relaxed">
                {generatedPrompt}
              </p>
            </div>

            <button
              onClick={handleCopy}
              className="flex items-center gap-2 px-4 py-2 text-sm text-slate-600 hover:text-slate-900 mb-6 transition"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4 text-green-600" /> Copied to
                  clipboard
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" /> Copy prompt
                </>
              )}
            </button>

            <div className="flex gap-4">
              <button
                onClick={() => setStep("edit")}
                className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition"
              >
                Edit Prompt
              </button>
              <button
                onClick={() => setStep("config")}
                className="flex-1 px-6 py-3 bg-slate-200 text-slate-800 rounded-lg hover:bg-slate-300 font-medium transition"
              >
                Go Back
              </button>
              <button
                onClick={handleSave}
                disabled={saveMutation.isPending}
                className="flex-1 px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-lg hover:from-green-600 hover:to-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition"
              >
                {saveMutation.isPending ? "Saving..." : "✅ Save Prompt"}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Edit Step ──
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <button
            onClick={() => setStep("preview")}
            className="flex items-center gap-2 text-slate-600 hover:text-slate-900 mb-6 transition font-medium"
          >
            <ChevronLeft className="w-4 h-4" /> Back to Preview
          </button>

          <h2 className="text-3xl font-bold mb-6 text-slate-900">
            Edit Prompt
          </h2>

          <textarea
            value={editedPrompt}
            onChange={(e) => setEditedPrompt(e.target.value)}
            rows={18}
            className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm mb-6 transition"
          />

          <div className="flex gap-4">
            <button
              onClick={() => setStep("preview")}
              className="flex-1 px-6 py-3 bg-slate-200 text-slate-800 rounded-lg hover:bg-slate-300 font-medium transition"
            >
              Back to Preview
            </button>
            <button
              onClick={handleSave}
              disabled={saveMutation.isPending}
              className="flex-1 px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-lg hover:from-green-600 hover:to-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition"
            >
              {saveMutation.isPending ? "Saving..." : "✅ Save Prompt"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SystemPromptGenerator;
