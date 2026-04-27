import { useState, useEffect } from "react";
import { trpc } from "../lib/trpc";
import { useWhatsAppSocket } from "../hooks/useWhatsAppSocket";

export default function AdminGlobalSettings() {
  const { globalAiModelChange } = useWhatsAppSocket();
  const [isLoading, setIsLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const [formData, setFormData] = useState({
    aiModel: "",
    aiApiUrl: "",
    aiApiKey: "",
    aiTemperature: 0.7,
  });

  // Fetch current global settings
  const getGlobalAi = trpc.admin.getGlobalAiModel.useQuery();

  // Mutation to update global AI model
  const updateGlobalAi = trpc.admin.updateGlobalAiModel.useMutation({
    onSuccess: () => {
      setSuccessMessage("✅ Global AI model updated for all tenants");
      setTimeout(() => setSuccessMessage(""), 5000);
      setIsLoading(false);
    },
    onError: (error) => {
      setErrorMessage(`❌ Error: ${error.message}`);
      setTimeout(() => setErrorMessage(""), 5000);
      setIsLoading(false);
    },
  });

  // Load existing settings on mount
  useEffect(() => {
    if (getGlobalAi.data?.isSet && getGlobalAi.data?.settings) {
      const settings = getGlobalAi.data.settings;
      setFormData({
        aiModel: settings.aiModel,
        aiApiUrl: settings.aiApiUrl,
        aiApiKey: "", // Don't show the key for security
        aiTemperature: Number(settings.aiTemperature) || 0.7,
      });
    }
  }, [getGlobalAi.data]);

  // Listen for real-time updates from Socket.IO
  useEffect(() => {
    if (globalAiModelChange) {
      // Show notification that another admin changed the settings
      setSuccessMessage(
        `ℹ️ Admin ${globalAiModelChange.changedBy} updated the global AI model to ${globalAiModelChange.aiModel}`
      );
      setTimeout(() => setSuccessMessage(""), 7000);

      // Refetch the settings
      getGlobalAi.refetch();
    }
  }, [globalAiModelChange]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelect>) => {
    const { name, value, type } = e.target;
    setFormData({
      ...formData,
      [name]: type === "number" ? parseFloat(value) : value,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.aiModel.trim()) {
      setErrorMessage("❌ AI model name is required");
      return;
    }

    if (!formData.aiApiUrl.trim()) {
      setErrorMessage("❌ API URL is required");
      return;
    }

    if (!formData.aiApiKey.trim()) {
      setErrorMessage("❌ API key is required");
      return;
    }

    setIsLoading(true);
    await updateGlobalAi.mutateAsync({
      aiModel: formData.aiModel,
      aiApiUrl: formData.aiApiUrl,
      aiApiKey: formData.aiApiKey,
      aiTemperature: formData.aiTemperature,
    });
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md mx-auto bg-white rounded-lg shadow-md p-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          🌐 Global AI Model Settings
        </h1>
        <p className="text-gray-600 text-sm mb-6">
          Update the AI model for all tenants. This will override each tenant's individual AI settings.
        </p>

        {successMessage && (
          <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded text-green-700 text-sm">
            {successMessage}
          </div>
        )}

        {errorMessage && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
            {errorMessage}
          </div>
        )}

        {getGlobalAi.isLoading ? (
          <div className="text-center py-8">
            <p className="text-gray-500">Loading current settings...</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* AI Model */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                AI Model Name
              </label>
              <input
                type="text"
                name="aiModel"
                value={formData.aiModel}
                onChange={handleChange}
                placeholder="e.g., gpt-4-turbo, llama3.2, gemma4:latest"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">
                The model identifier from your AI provider
              </p>
            </div>

            {/* API URL */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                API URL
              </label>
              <input
                type="text"
                name="aiApiUrl"
                value={formData.aiApiUrl}
                onChange={handleChange}
                placeholder="e.g., https://api.groq.com/openai/v1"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">
                OpenAI-compatible API endpoint
              </p>
            </div>

            {/* API Key */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                API Key
              </label>
              <input
                type="password"
                name="aiApiKey"
                value={formData.aiApiKey}
                onChange={handleChange}
                placeholder="Your API key"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">
                Will be encrypted in the database
              </p>
            </div>

            {/* Temperature */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Temperature (Creativity) - {formData.aiTemperature.toFixed(1)}
              </label>
              <input
                type="range"
                name="aiTemperature"
                min="0"
                max="2"
                step="0.1"
                value={formData.aiTemperature}
                onChange={handleChange}
                className="w-full"
              />
              <p className="text-xs text-gray-500 mt-1">
                Lower = more deterministic (0.0), Higher = more creative (2.0)
              </p>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading || updateGlobalAi.isPending}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium py-2 px-4 rounded-md transition mt-6"
            >
              {isLoading || updateGlobalAi.isPending ? "Updating..." : "Update Global AI Model"}
            </button>
          </form>
        )}

        {/* Info Box */}
        <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded text-blue-700 text-xs">
          <p className="font-semibold mb-2">⚠️ Important:</p>
          <ul className="list-disc list-inside space-y-1">
            <li>All connected tenants will receive a real-time notification</li>
            <li>The new AI model will be used for all new messages</li>
            <li>Each tenant can still override with their own settings if desired</li>
            <li>API keys are encrypted before storage</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
