import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, TrendingUp, Plus, Loader2, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import DiscoveryFeed from '../components/feed/DiscoveryFeed';
import FeedFilters from '../components/feed/FeedFilters';
import LoadingSpinner from '../components/common/LoadingSpinner';
import { projectAPI, staticAPI } from '../services/api';
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
  const loadMoreRef = useRef(null);

  // Fetch projects from API with infinite scroll
  const { 
    data, 
    isLoading: projectsLoading, 
    error: projectsError, 
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch 
  } = useInfiniteQuery({
    queryKey: ['projects', filters.status, filters.category, filters.difficulty],
    queryFn: async ({ pageParam = null }) => {
      try {
        const params = {};
        if (filters.status && filters.status !== 'all') params.status = filters.status;
        if (filters.category) params.category = filters.category;
        if (filters.difficulty) params.difficulty = filters.difficulty;
        params.limit = 20;
        if (pageParam) params.cursor = pageParam;

        const response = await projectAPI.getProjects(params);
        return response.data;
      } catch (err) {
        // Backend unreachable (no deployed backend) — return empty gracefully
        if (!err.response) return { projects: [], has_more: false, next_cursor: null };
        throw err;
      }
    },
    getNextPageParam: (lastPage) => lastPage.next_cursor || undefined,
    staleTime: 60000, // 1 minute
    retry: false,
  });

  // Fetch platform stats
  const { data: statsData } = useQuery({
    queryKey: ['stats'],
    queryFn: async () => {
      try {
        const response = await staticAPI.getStats();
        return response.data;
      } catch (err) {
        if (!err.response) return { stats: { active_projects: 0, recruiting_projects: 0, total_students: 0 } };
        throw err;
      }
    },
    staleTime: 300000, // 5 minutes
    retry: false,
  });

  // Flatten all pages of projects
  const projects = data?.pages.flatMap(page => page.projects) || [];
  
  const stats = statsData?.stats || {
    active_projects: 0,
    recruiting_projects: 0,
    total_students: 0,
  };

  // Filter projects based on search and exclude user's own projects
  const filteredProjects = projects.filter((project) => {
    // Don't show projects owned by current user
    if (user && project.owner_id === user.uid) {
      return false;
    }
    
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

  // Infinite scroll observer
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { threshold: 0.1 }
    );

    if (loadMoreRef.current) {
      observer.observe(loadMoreRef.current);
    }

    return () => {
      if (loadMoreRef.current) {
        observer.unobserve(loadMoreRef.current);
      }
    };
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

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
                
                {/* Infinite scroll trigger */}
                <div ref={loadMoreRef} className="py-8 text-center">
                  {isFetchingNextPage && (
                    <div className="flex items-center justify-center gap-2 text-gray-600">
                      <Loader2 className="h-6 w-6 animate-spin text-red-600" />
                      <span>Loading more projects...</span>
                    </div>
                  )}
                  {!hasNextPage && sortedProjects.length > 0 && (
                    <p className="text-gray-500 text-sm">You've reached the end 🎉</p>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DiscoveryPage;
