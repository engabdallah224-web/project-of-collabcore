import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Calendar, Clock, Users, Video, Phone, Edit, Trash2, ExternalLink, 
  Plus, X, CheckCircle, AlertCircle, PlayCircle, MapPin 
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchMeetingsDirect, deleteMeetingDirect, generateJitsiUrl, createMeetingDirect } from '../../services/firestoreService';

const MeetingsPanel = ({ projectId, teamMembers }) => {
  const [activeTab, setActiveTab] = useState('upcoming');
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [selectedMeeting, setSelectedMeeting] = useState(null);
  const queryClient = useQueryClient();

  // Fetch all meetings from Firestore
  const { data: meetingsData, isLoading } = useQuery({
    queryKey: ['project-meetings', projectId],
    queryFn: () => fetchMeetingsDirect(projectId),
    enabled: !!projectId,
    refetchInterval: 30000,
  });

  // Delete meeting
  const deleteMeetingMutation = useMutation({
    mutationFn: (meetingId) => deleteMeetingDirect(meetingId),
    onSuccess: () => {
      queryClient.invalidateQueries(['project-meetings', projectId]);
    },
  });

  // Join meeting — just open the URL
  const handleJoinMeeting = (meeting) => {
    if (meeting.meeting_url) {
      window.open(meeting.meeting_url, '_blank');
    }
  };

  // Filter meetings by status
  const upcomingMeetings = meetingsData?.filter(m => 
    m.meeting_status === 'scheduled' && new Date(m.scheduled_at) > new Date()
  ) || [];

  const pastMeetings = meetingsData?.filter(m => 
    m.meeting_status === 'completed' || new Date(m.scheduled_at) < new Date()
  ) || [];

  const allMeetings = meetingsData || [];

  const getMeetings = () => {
    switch (activeTab) {
      case 'upcoming': return upcomingMeetings;
      case 'past': return pastMeetings;
      default: return allMeetings;
    }
  };

  const meetings = getMeetings();

  const getMeetingTypeIcon = (type) => {
    const icons = {
      standup: Video,
      planning: Calendar,
      review: CheckCircle,
      retrospective: AlertCircle,
      other: Video
    };
    const Icon = icons[type] || Video;
    return <Icon className="h-4 w-4" />;
  };

  const getMeetingTypeColor = (type) => {
    const colors = {
      standup: 'bg-red-100 text-red-700 border-red-200',
      planning: 'bg-purple-100 text-purple-700 border-purple-200',
      review: 'bg-green-100 text-green-700 border-green-200',
      retrospective: 'bg-orange-100 text-orange-700 border-orange-200',
      other: 'bg-gray-100 text-gray-700 border-gray-200'
    };
    return colors[type] || colors.other;
  };

  const formatMeetingTime = (dateString) => {
    try {
      const date = new Date(dateString);
      const dateOptions = { month: 'short', day: 'numeric', year: 'numeric' };
      const timeOptions = { hour: 'numeric', minute: '2-digit', hour12: true };
      return {
        date: date.toLocaleDateString('en-US', dateOptions),
        time: date.toLocaleTimeString('en-US', timeOptions)
      };
    } catch {
      return { date: 'Invalid date', time: '' };
    }
  };

  const isUpcoming = (dateString) => {
    return new Date(dateString) > new Date();
  };

  const handleDeleteMeeting = (meetingId) => {
    if (window.confirm('Are you sure you want to delete this meeting?')) {
      deleteMeetingMutation.mutate(meetingId);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600"></div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Meetings</h2>
            <p className="text-sm text-gray-600 mt-1">
              {upcomingMeetings.length} upcoming • {pastMeetings.length} past
            </p>
          </div>
          <motion.button
            onClick={() => setShowScheduleModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 shadow-md transition-colors"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <Plus className="h-4 w-4" />
            Schedule Meeting
          </motion.button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mt-4">
          {[
            { id: 'upcoming', label: 'Upcoming', count: upcomingMeetings.length },
            { id: 'past', label: 'Past', count: pastMeetings.length },
            { id: 'all', label: 'All', count: allMeetings.length }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === tab.id
                  ? 'bg-red-100 text-red-700 border border-red-200'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {tab.label} <span className="ml-1 text-xs">({tab.count})</span>
            </button>
          ))}
        </div>
      </div>

      {/* Meetings List */}
      <div className="flex-1 overflow-y-auto p-6">
        {meetings.length === 0 ? (
          <div className="text-center py-12">
            <Calendar className="h-16 w-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              No {activeTab} meetings
            </h3>
            <p className="text-gray-600 mb-4">
              {activeTab === 'upcoming' 
                ? 'Schedule a meeting to collaborate with your team'
                : 'No meetings found for this filter'}
            </p>
            <button
              onClick={() => setShowScheduleModal(true)}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 shadow-md transition-colors"
            >
              Schedule Meeting
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <AnimatePresence>
              {meetings.map((meeting) => {
                const timeInfo = formatMeetingTime(meeting.scheduled_at);
                const upcoming = isUpcoming(meeting.scheduled_at);
                
                return (
                  <motion.div
                    key={meeting.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5 hover:shadow-lg transition-all"
                  >
                    {/* Meeting Header */}
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-start gap-3">
                        <div className={`p-2 rounded-lg border ${getMeetingTypeColor(meeting.meeting_type)}`}>
                          {getMeetingTypeIcon(meeting.meeting_type)}
                        </div>
                        <div>
                          <h3 className="font-semibold text-gray-900 text-lg">
                            {meeting.title}
                          </h3>
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium mt-1 border ${getMeetingTypeColor(meeting.meeting_type)}`}>
                            {meeting.meeting_type}
                          </span>
                        </div>
                      </div>

                      {/* Status Badge */}
                      {upcoming && (
                        <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-bold border border-green-200">
                          Upcoming
                        </span>
                      )}
                    </div>

                    {/* Description */}
                    {meeting.description && (
                      <p className="text-sm text-gray-600 mb-3">
                        {meeting.description}
                      </p>
                    )}

                    {/* Meeting Details */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <Calendar className="h-4 w-4 text-gray-400" />
                        <span>{timeInfo.date}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <Clock className="h-4 w-4 text-gray-400" />
                        <span>{timeInfo.time}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <Users className="h-4 w-4 text-gray-400" />
                        <span>{meeting.participants?.length || 0} participants</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <Clock className="h-4 w-4 text-gray-400" />
                        <span>{meeting.duration_minutes || 60} min</span>
                      </div>
                    </div>

                    {/* Agenda */}
                    {meeting.agenda && meeting.agenda.length > 0 && (
                      <div className="mb-4 p-3 bg-red-50 rounded-lg border border-red-100">
                        <h4 className="text-xs font-semibold text-red-900 mb-2">Agenda</h4>
                        <ul className="text-sm text-gray-700 space-y-1">
                          {meeting.agenda.map((item, idx) => (
                            <li key={idx} className="flex items-start gap-2">
                              <span className="text-red-400 mt-1">•</span>
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex items-center gap-2 pt-3 border-t border-gray-100">
                      {upcoming && meeting.meeting_url && (
                        <motion.button
                          onClick={() => handleJoinMeeting(meeting)}
                          className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 shadow-md transition-colors font-semibold"
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                        >
                          <PlayCircle className="h-4 w-4" />
                          Join Meeting
                          <ExternalLink className="h-3 w-3" />
                        </motion.button>
                      )}
                      
                      {upcoming && (
                        <>
                          <motion.button
                            onClick={() => setSelectedMeeting(meeting)}
                            className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                          >
                            <Edit className="h-4 w-4" />
                          </motion.button>
                          <motion.button
                            onClick={() => handleDeleteMeeting(meeting.id)}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </motion.button>
                        </>
                      )}

                      {!upcoming && meeting.meeting_url && (
                        <a
                          href={meeting.meeting_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-red-600 hover:text-red-700 flex items-center gap-1 font-medium"
                        >
                          View Recording <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>

      {showScheduleModal && (
        <PanelScheduleModal
          projectId={projectId}
          teamMembers={teamMembers}
          onClose={() => setShowScheduleModal(false)}
          onSuccess={() => {
            setShowScheduleModal(false);
            queryClient.invalidateQueries(['project-meetings', projectId]);
          }}
        />
      )}
    </div>
  );
};

export default MeetingsPanel;

// ─── Inline schedule modal for MeetingsPanel ─────────────────────────────────
function PanelScheduleModal({ projectId, teamMembers, onClose, onSuccess }) {
  const [formData, setFormData] = useState({
    title: '',
    meeting_type: 'standup',
    scheduled_at: '',
    duration_minutes: 60,
    description: '',
    agenda: [''],
    useCustomUrl: false,
    meeting_url: '',
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaveError('');
    setSaving(true);
    try {
      const url = formData.useCustomUrl && formData.meeting_url.trim()
        ? formData.meeting_url.trim()
        : generateJitsiUrl(projectId, `${formData.meeting_type}-${Date.now()}`);

      await createMeetingDirect({
        projectId,
        title: formData.title,
        description: formData.description,
        meeting_type: formData.meeting_type,
        scheduled_at: formData.scheduled_at
          ? new Date(formData.scheduled_at).toISOString()
          : new Date().toISOString(),
        duration_minutes: parseInt(formData.duration_minutes) || 60,
        meeting_url: url,
        agenda: formData.agenda.filter((a) => a.trim() !== ''),
        participants: teamMembers?.map((m) => m.id) || [],
      });
      onSuccess();
    } catch {
      setSaveError('Failed to schedule meeting. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-900 bg-opacity-30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto"
      >
        <div className="p-6 border-b border-gray-200 sticky top-0 bg-white z-10">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-900">Schedule Meeting</h2>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg"><X className="h-5 w-5" /></button>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Title *</label>
            <input type="text" value={formData.title} required
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="e.g., Sprint Planning"
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Type</label>
              <select value={formData.meeting_type}
                onChange={(e) => setFormData({ ...formData, meeting_type: e.target.value })}
                className="w-full px-3 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500 text-sm">
                <option value="standup">Daily Standup</option>
                <option value="planning">Planning</option>
                <option value="review">Review</option>
                <option value="retrospective">Retrospective</option>
                <option value="brainstorming">Brainstorming</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Scheduled At *</label>
              <input type="datetime-local" required value={formData.scheduled_at}
                onChange={(e) => setFormData({ ...formData, scheduled_at: e.target.value })}
                className="w-full px-3 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500 text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Duration (min)</label>
            <input type="number" value={formData.duration_minutes} min="15" step="15"
              onChange={(e) => setFormData({ ...formData, duration_minutes: e.target.value })}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500 text-sm" />
          </div>
          <div>
            <label className="flex items-center space-x-2 text-sm font-semibold text-gray-700 mb-2 cursor-pointer">
              <input type="checkbox" checked={formData.useCustomUrl}
                onChange={(e) => setFormData({ ...formData, useCustomUrl: e.target.checked, meeting_url: '' })}
                className="rounded text-red-600" />
              <span>Use custom meeting URL (Zoom, Google Meet…)</span>
            </label>
            {formData.useCustomUrl && (
              <input type="url" value={formData.meeting_url}
                onChange={(e) => setFormData({ ...formData, meeting_url: e.target.value })}
                placeholder="https://zoom.us/j/123"
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500 text-sm" />
            )}
            {!formData.useCustomUrl && (
              <p className="text-xs text-gray-500">A free Jitsi Meet room will be created automatically.</p>
            )}
          </div>
          {saveError && <p className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">{saveError}</p>}
          <div className="flex space-x-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-3 bg-gray-100 text-gray-700 rounded-xl font-semibold hover:bg-gray-200 transition-all">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 px-4 py-3 bg-red-600 text-white rounded-xl font-semibold hover:bg-red-700 transition-all disabled:opacity-50">
              {saving ? 'Scheduling…' : 'Schedule Meeting'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

