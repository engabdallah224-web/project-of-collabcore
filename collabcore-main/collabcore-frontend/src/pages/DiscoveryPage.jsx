import { useState } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, TrendingUp, Plus, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import DiscoveryFeed from '../components/feed/DiscoveryFeed';
import FeedFilters from '../components/feed/FeedFilters';
import LoadingSpinner from '../components/common/LoadingSpinner';
import { fetchProjects } from '../services/firestoreService';
import { useAuth } from '../hooks/useAuth';

const DiscoveryPage = () => {
  const { user } = useAuth();
  const [filters, setFilters] = useState({
    search: '',
    status: 'recruiting',
    skills: [],
    category: '',
    difficulty: ''
  });

  const [sortBy, setSortBy] = useState('recent'); // 'match', 'recent', 'popular'
  // Fetch ALL projects directly from Firestore (works on mobile + Vercel without backend)
  const {
    data: projectsData,
    isLoading: projectsLoading,
    error: projectsError,
    refetch,
  } = useQuery({
    queryKey: ['projects', filters.status, filters.category, filters.difficulty],
    queryFn: () =>
      fetchProjects({
        status: filters.status,
        category: filters.category,
        difficulty: filters.difficulty,
        limitCount: 100,
      }),
    staleTime: 60000,
    retry: 1,
  });

  const projects = projectsData || [];

  const stats = {
    active_projects: projects.filter((p) => p.status === 'active').length,
    recruiting_projects: projects.filter((p) => p.status === 'recruiting').length,
    total_students: 0,
  };

  // Filter projects based on search and exclude user's own projects
  const filteredProjects = projects.filter((project) => {
    // Apply search filter
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      return (
        project.title?.toLowerCase().includes(searchLower) ||
        project.description?.toLowerCase().includes(searchLower) ||
        project.required_skills?.some(skill => skill.toLowerCase().includes(searchLower)) ||
        project.tags?.some(tag => tag.toLowerCase().includes(searchLower))
      );
    }
    return true;
  });

  // Sort projects
  const sortedProjects = [...filteredProjects].sort((a, b) => {
    if (sortBy === 'recent') {
      return new Date(b.created_at) - new Date(a.created_at);
    } else if (sortBy === 'popular') {
      return (b.current_team_size || 0) - (a.current_team_size || 0);
    }
    return 0; // match sorting would require ML in the future
  });

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  if (projectsLoading) {
    return (
      <div className="min-h-screen bg-[#f3f3f3] flex items-center justify-center">
        <div className="text-center">
          <LoadingSpinner size="lg" />
          <p className="mt-4 text-gray-700">Loading projects...</p>
        </div>
      </div>
    );
  }

  if (projectsError) {
    // Only show full error page for real server errors (not network/connection issues)
    if (projectsError.response) {
      return (
        <div className="min-h-screen bg-[#f3f3f3] flex items-center justify-center">
          <div className="text-center">
            <div className="text-red-500 text-6xl mb-4">⚠️</div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Failed to load projects</h2>
            <p className="text-gray-700 mb-4">
              {projectsError.response?.data?.detail || 'Something went wrong. Please try again.'}
            </p>
            <button
              onClick={() => refetch()}
              className="px-6 py-3 bg-red-600 text-gray-900 rounded-xl font-semibold hover:bg-red-700 shadow-lg"
            >
              Try Again
            </button>
          </div>
        </div>
      );
    }
    // Network error — fall through and show empty projects list
  }

  return (
    <div className="min-h-screen bg-[#f3f3f3]">
      <div className="container mx-auto px-4 py-4">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-4"
        >
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-3">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-1">
                Discover Projects
              </h1>
              <p className="text-gray-700 flex items-center gap-2 text-sm">
                <Sparkles className="h-4 w-4 text-red-500" />
                {sortedProjects.length} projects available
              </p>
            </div>
            <div className="flex gap-2">
              <Link to="/projects/create">
                <motion.button
                  className="flex items-center gap-2 px-4 py-2 bg-red-600 text-gray-900 rounded-lg font-semibold hover:bg-red-700 shadow-md hover:shadow-lg text-sm"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <Plus className="h-4 w-4" />
                  Create Project
                </motion.button>
              </Link>
            </div>
          </div>

          {/* Sort Options */}
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <span className="text-sm font-semibold text-gray-700">Sort by:</span>
            {[
              { value: 'recent', label: '🕐 Recent' },
              { value: 'popular', label: '🔥 Popular' },
            ].map((sort) => (
              <motion.button
                key={sort.value}
                onClick={() => setSortBy(sort.value)}
                className={`px-3 py-1 rounded-lg text-sm font-medium transition-all ${
                  sortBy === sort.value
                    ? 'bg-red-200 text-gray-900'
                    : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
                }`}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                {sort.label}
              </motion.button>
            ))}
          </div>

          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
            <motion.div
              className="bg-white rounded-lg p-3 shadow-sm border border-gray-200"
              whileHover={{ scale: 1.01 }}
            >
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-black flex items-center justify-center">
                  <TrendingUp className="h-4 w-4 text-white" />
                </div>
                <div>
                  <p className="text-lg font-bold text-gray-900">{stats.active_projects || 0}</p>
                  <p className="text-xs text-gray-600">Active Projects</p>
                </div>
              </div>
            </motion.div>
            <motion.div
              className="bg-white rounded-lg p-3 shadow-sm border border-gray-200"
              whileHover={{ scale: 1.01 }}
            >
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-black flex items-center justify-center">
                  <Sparkles className="h-4 w-4 text-white" />
                </div>
                <div>
                  <p className="text-lg font-bold text-gray-900">{stats.recruiting_projects || 0}</p>
                  <p className="text-xs text-gray-600">Recruiting Now</p>
                </div>
              </div>
            </motion.div>
            <motion.div
              className="bg-white rounded-lg p-3 shadow-sm border border-gray-200"
              whileHover={{ scale: 1.01 }}
            >
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-black flex items-center justify-center">
                  <Users className="h-4 w-4 text-white" />
                </div>
                <div>
                  <p className="text-lg font-bold text-gray-900">{stats.total_students || 0}</p>
                  <p className="text-xs text-gray-600">Students Active</p>
                </div>
              </div>
            </motion.div>
          </div>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
          {/* Filters Sidebar */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3 }}
            className="lg:col-span-1"
          >
            <FeedFilters filters={filters} setFilters={setFilters} />
          </motion.div>

          {/* Projects Feed */}
          <div className="lg:col-span-3">
            {sortedProjects.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-6xl mb-4">🔍</div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">No projects found</h3>
                <p className="text-gray-600 mb-6">
                  Try adjusting your filters or create a new project!
                </p>
                <Link to="/projects/create">
                  <motion.button
                    className="px-6 py-3 bg-red-600 text-gray-900 rounded-xl font-semibold hover:bg-red-700  shadow-lg"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    Create Project
                  </motion.button>
                </Link>
              </div>
            ) : (
              <>
                <DiscoveryFeed projects={sortedProjects} />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DiscoveryPage;
