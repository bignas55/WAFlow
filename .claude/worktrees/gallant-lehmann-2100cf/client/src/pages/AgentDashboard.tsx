import React, { useState } from 'react';
import { Users, MessageSquare, Clock, CheckCircle, AlertTriangle, Phone, Star, Activity } from 'lucide-react';
import { trpc } from '../lib/trpc';
import { Badge } from '../components/ui/Badge';
import { Spinner } from '../components/ui/Spinner';

export default function AgentDashboard() {
  const [selectedAgent, setSelectedAgent] = useState<number | null>(null);

  const { data: agents, isLoading } = trpc.advanced.agents.useQuery(undefined, {
    refetchInterval: 30000,
  });

  const { data: agentConvs } = trpc.advanced.agentConversations.useQuery(
    { agentId: selectedAgent! },
    { enabled: !!selectedAgent }
  );

  const statusColor: Record<string, string> = {
    online: 'bg-green-500',
    busy: 'bg-yellow-500',
    away: 'bg-orange-400',
    offline: 'bg-gray-400',
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><Spinner size="lg" /></div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Agent Dashboard</h1>
        <p className="text-gray-500 text-sm mt-0.5">Monitor human agent performance and assignments</p>
      </div>

      {/* Team Overview */}
      <div className="grid grid-cols-4 gap-4">
        {[
          {
            label: 'Total Agents',
            value: agents?.length || 0,
            icon: <Users className="w-5 h-5 text-blue-600" />,
            bg: 'bg-blue-50',
          },
          {
            label: 'Online Now',
            value: agents?.filter((a: any) => a.status === 'online').length || 0,
            icon: <div className="w-3 h-3 rounded-full bg-green-500" />,
            bg: 'bg-green-50',
          },
          {
            label: 'Active Chats',
            value: agents?.reduce((sum: number, a: any) => sum + (a.activeConversations || 0), 0) || 0,
            icon: <MessageSquare className="w-5 h-5 text-purple-600" />,
            bg: 'bg-purple-50',
          },
          {
            label: 'Pending Escalations',
            value: agents?.reduce((sum: number, a: any) => sum + (a.pendingEscalations || 0), 0) || 0,
            icon: <AlertTriangle className="w-5 h-5 text-orange-600" />,
            bg: 'bg-orange-50',
          },
        ].map(({ label, value, icon, bg }) => (
          <div key={label} className={`${bg} rounded-xl p-5 border border-gray-100`}>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-gray-500">{label}</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
              </div>
              <div className="p-2 bg-white rounded-lg shadow-sm">{icon}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* Agent List */}
        <div className="col-span-4 bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-800">Team Members</h2>
          </div>
          <div className="divide-y divide-gray-50">
            {agents?.length === 0 ? (
              <div className="p-6 text-center text-gray-400 text-sm">No agents configured</div>
            ) : (
              agents?.map((agent: any) => (
                <div
                  key={agent.id}
                  onClick={() => setSelectedAgent(agent.id)}
                  className={`px-5 py-4 cursor-pointer hover:bg-gray-50 transition ${
                    selectedAgent === agent.id ? 'bg-blue-50 border-l-2 border-l-blue-500' : ''
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <div className="w-10 h-10 bg-gradient-to-br from-indigo-400 to-blue-500 rounded-full flex items-center justify-center">
                        <span className="text-white font-medium text-sm">
                          {agent.name[0].toUpperCase()}
                        </span>
                      </div>
                      <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${statusColor[agent.status] || 'bg-gray-400'}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{agent.name}</p>
                      <p className="text-xs text-gray-400 truncate">{agent.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 mt-2">
                    <span className="text-xs text-gray-500 flex items-center gap-1">
                      <MessageSquare className="w-3 h-3" />
                      {agent.activeConversations || 0} active
                    </span>
                    {agent.satisfactionScore && (
                      <span className="text-xs text-yellow-500 flex items-center gap-0.5">
                        <Star className="w-3 h-3 fill-yellow-400" />
                        {Number(agent.satisfactionScore).toFixed(1)}
                      </span>
                    )}
                    <Badge
                      variant={agent.status === 'online' ? 'success' : agent.status === 'busy' ? 'warning' : 'outline'}
                    >
                      {agent.status}
                    </Badge>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Agent Detail */}
        <div className="col-span-8 space-y-4">
          {!selectedAgent ? (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-12 text-center text-gray-400">
              <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Select an agent to view their performance</p>
            </div>
          ) : (
            <>
              {/* Performance Metrics */}
              {(() => {
                const agent = agents?.find((a: any) => a.id === selectedAgent);
                if (!agent) return null;
                return (
                  <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
                    <h3 className="font-semibold text-gray-800 mb-4">{agent.name} — Performance</h3>
                    <div className="grid grid-cols-3 gap-4">
                      {[
                        { label: 'Conversations Handled', value: agent.totalConversations || 0, icon: MessageSquare, color: 'text-blue-600' },
                        { label: 'Avg Response Time', value: `${agent.avgResponseTime || 0}s`, icon: Clock, color: 'text-green-600' },
                        { label: 'Resolution Rate', value: `${agent.resolutionRate || 0}%`, icon: CheckCircle, color: 'text-purple-600' },
                        { label: 'Messages Today', value: agent.messagesToday || 0, icon: Activity, color: 'text-orange-600' },
                        { label: 'Escalations', value: agent.escalations || 0, icon: AlertTriangle, color: 'text-red-500' },
                        { label: 'Customer Rating', value: agent.satisfactionScore ? `${Number(agent.satisfactionScore).toFixed(1)}/5` : 'N/A', icon: Star, color: 'text-yellow-500' },
                      ].map(({ label, value, icon: Icon, color }) => (
                        <div key={label} className="text-center p-3 bg-gray-50 rounded-xl">
                          <Icon className={`w-5 h-5 ${color} mx-auto mb-1`} />
                          <p className="text-xs text-gray-500">{label}</p>
                          <p className={`font-bold ${color} text-lg`}>{value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* Active Conversations */}
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
                <div className="px-5 py-4 border-b border-gray-100">
                  <h3 className="font-semibold text-gray-800">Assigned Conversations</h3>
                </div>
                <div className="divide-y divide-gray-50">
                  {!agentConvs ? (
                    <div className="flex items-center justify-center h-16"><Spinner /></div>
                  ) : agentConvs.length === 0 ? (
                    <div className="p-6 text-center text-gray-400 text-sm">No active conversations</div>
                  ) : (
                    agentConvs.map((conv: any) => (
                      <div key={conv.id} className="px-5 py-3 flex items-center gap-4">
                        <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center">
                          <span className="text-gray-600 text-xs font-medium">
                            {(conv.customerName || conv.customerPhone || '?')[0].toUpperCase()}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">
                            {conv.customerName || conv.customerPhone}
                          </p>
                          <p className="text-xs text-gray-400 truncate">{conv.lastMessage}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          {conv.isEscalated && <Badge variant="warning">Escalated</Badge>}
                          <Badge variant={conv.status === 'active' ? 'success' : 'outline'}>{conv.status}</Badge>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
