import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Search, Users, Briefcase, Filter, MapPin, X, Clock, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { projectAPI, userAPI, searchAPI, staticAPI } from '../services/api';
import { formatStatus } from '../utils/helpers';

const SearchPage = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchType, setSearchType] = useState('projects'); // 'projects' or 'users'

  const [sortBy, setSortBy] = useState('relevance');
  const [filters, setFilters] = useState({
    skills: [],
    university: '',
    status: 'all',
    teamSize: 'all',
    experience: 'all'
  });
  const [recentSearches] = useState(['Machine Learning', 'Web Development', 'Mobile Apps']);
  const loadMoreRef = useRef(null);



  // Fetch projects from API with infinite scroll
  const {
    data: projectsData,
    fetchNextPage: fetchNextProjects,
    hasNextPage: hasNextProjects,
    isFetchingNextPage: isFetchingNextProjects
  } = useInfiniteQuery({
    queryKey: ['search-projects', searchQuery, filters],
    queryFn: async ({ pageParam = null }) => {
      if (searchQuery) {
        const params = { limit: 20 };
        if (pageParam) params.cursor = pageParam;
        const response = await searchAPI.searchProjects(searchQuery, params);
        return response.data;
      } else {
        const params = { limit: 20 };
        if (filters.status !== 'all') params.status = filters.status;
        if (filters.category) params.category = filters.category;
        if (pageParam) params.cursor = pageParam;
        const response = await projectAPI.getProjects(params);
        return response.data;
      }
    },
    getNextPageParam: (lastPage) => lastPage.next_cursor || undefined,
    enabled: searchType === 'projects',
  });

  // Fetch users from API (keeping simple for now, can add pagination later)
  const { data: usersData } = useQuery({
    queryKey: ['search-users', searchQuery],
    queryFn: async () => {
      if (searchQuery) {
        const response = await searchAPI.searchUsers(searchQuery);
        return response.data;
      } else {
        const response = await userAPI.getUsers();
        return response.data;
      }
    },
    enabled: searchType === 'users',
  });

  // Fetch skills and universities for filters
  const { data: skillsData } = useQuery({
    queryKey: ['skills'],
    queryFn: async () => {
      const response = await staticAPI.getSkills();
      return response.data;
    },
  });

  const { data: universitiesData } = useQuery({
    queryKey: ['universities'],
    queryFn: async () => {
      const response = await staticAPI.getUniversities();
      return response.data;
    },
  });

  const projectResults = projectsData?.pages.flatMap(page => page.projects) || [];
  const userResults = usersData?.users || [];
  const popularSkills = skillsData?.skills?.slice(0, 6) || [];
  const universities = universitiesData?.universities?.slice(0, 5) || [];

  // Infinite scroll for projects
  useEffect(() => {
    if (searchType !== 'projects') return;
    
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextProjects && !isFetchingNextProjects) {
          fetchNextProjects();
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
  }, [searchType, hasNextProjects, isFetchingNextProjects, fetchNextProjects]);

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.1 }
    }
  };



  const handleRemoveFilter = (filterType, value) => {
    if (filterType === 'skills') {
      setFilters(prev => ({
        ...prev,
        skills: prev.skills.filter(s => s !== value)
      }));
    } else {
      setFilters(prev => ({
        ...prev,
        [filterType]: 'all'
      }));
    }
  };

  const activeFiltersCount = 
    filters.skills.length + 
    (filters.university !== '' ? 1 : 0) + 
    (filters.status !== 'all' ? 1 : 0) +
    (filters.teamSize !== 'all' ? 1 : 0) +
    (filters.experience !== 'all' ? 1 : 0);

  return (
    <div className="min-h-screen bg-[#f3f3f3]">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            Search & Discover
          </h1>
          <p className="text-gray-600">
            Find projects and collaborators that match your interests
          </p>
        </motion.div>

        {/* Search Bar */}
        <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-6 mb-6">
          <div className="flex flex-col md:flex-row gap-3 mb-4">
            <div className="flex-1 relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search for projects, people, or skills..."
                className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-xl focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
              />
            </div>
            <button className="px-6 py-3 bg-red-600 text-white rounded-xl font-semibold hover:bg-red-700 shadow-sm transition-all whitespace-nowrap">
              Search
            </button>
          </div>

          {/* Search Type Toggle and Filter Button */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-2">
              <button
              onClick={() => setSearchType('projects')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-all ${
                searchType === 'projects'
                    ? 'bg-red-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <Briefcase className="h-4 w-4" />
              Projects
              </button>
              <button
              onClick={() => setSearchType('users')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-all ${
                searchType === 'users'
                    ? 'bg-red-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                <Users className="h-4 w-4" />
                People
              </button>
            </div>


          </div>

          {/* Recent Searches */}
          {searchQuery === '' && recentSearches.length > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-200">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="h-4 w-4 text-gray-400" />
                <span className="text-sm font-medium text-gray-600">Recent Searches</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {recentSearches.map((search, idx) => (
                  <button
                    key={idx}
                    onClick={() => setSearchQuery(search)}
                    className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-xl text-sm hover:bg-gray-200 transition-all"
                  >
                    {search}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Main Content Area with Sidebar Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Filters Sidebar */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3 }}
            className="lg:col-span-1"
          >
            <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                    <Filter className="h-5 w-5" />
                    Filters
                  </h3>
                  {activeFiltersCount > 0 && (
                    <button
                      onClick={() => setFilters({ skills: [], university: '', status: 'all', teamSize: 'all', experience: 'all' })}
                      className="text-sm text-red-600 hover:text-red-700 font-medium"
                    >
                      Clear All
                    </button>
                  )}
                </div>

                <div className="space-y-6">
                  {/* Popular Skills */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Skills</label>
                    <div className="flex flex-wrap gap-2">
                      {popularSkills.map(skill => (
                        <button
                          key={skill}
                          onClick={() => {
                            setFilters(prev => ({
                              ...prev,
                              skills: prev.skills.includes(skill)
                                ? prev.skills.filter(s => s !== skill)
                                : [...prev.skills, skill]
                            }));
                          }}
                          className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                            filters.skills.includes(skill)
                              ? 'bg-red-600 text-white'
                              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          }`}
                        >
                          {skill}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* University */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">University</label>
                    <select
                      value={filters.university}
                      onChange={(e) => setFilters(prev => ({ ...prev, university: e.target.value }))}
                      className="w-full px-3 py-2 bg-gray-100 text-gray-700 rounded-lg font-medium focus:outline-none focus:ring-2 focus:ring-purple-500"
                    >
                      <option value="">All Universities</option>
                      {universities.map(uni => (
                        <option key={uni} value={uni}>{uni}</option>
                      ))}
                    </select>
                  </div>

                  {/* Project Status */}
                  {searchType === 'projects' && (
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Status</label>
                      <select
                        value={filters.status}
                        onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
                        className="w-full px-3 py-2 bg-gray-100 text-gray-700 rounded-lg font-medium focus:outline-none focus:ring-2 focus:ring-purple-500"
                      >
                        <option value="all">All Status</option>
                        <option value="recruiting">Recruiting</option>
                        <option value="active">Active</option>
                        <option value="completed">Completed</option>
                      </select>
                    </div>
                  )}

                  {/* Team Size */}
                  {searchType === 'projects' && (
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Team Size</label>
                      <select
                        value={filters.teamSize}
                        onChange={(e) => setFilters(prev => ({ ...prev, teamSize: e.target.value }))}
                        className="w-full px-3 py-2 bg-gray-100 text-gray-700 rounded-lg font-medium focus:outline-none focus:ring-2 focus:ring-purple-500"
                      >
                        <option value="all">Any Size</option>
                        <option value="small">Small (2-5)</option>
                        <option value="medium">Medium (6-10)</option>
                        <option value="large">Large (11+)</option>
                      </select>
                    </div>
                  )}

                  {/* Active Filter Chips */}
                  {activeFiltersCount > 0 && (
                    <div className="mt-4 pt-4 border-t border-gray-200">
                      <div className="flex flex-wrap gap-2">
                        {filters.skills.map(skill => (
                          <motion.div
                            key={skill}
                            className="flex items-center gap-1 px-3 py-1.5 bg-purple-100 text-red-700 rounded-lg text-sm font-semibold"
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            exit={{ scale: 0 }}
                          >
                            {skill}
                            <button
                              onClick={() => handleRemoveFilter('skills', skill)}
                              className="hover:bg-purple-200 rounded-full p-0.5"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </motion.div>
                        ))}
                        {filters.university && (
                          <motion.div
                            className="flex items-center gap-1 px-3 py-1.5 bg-blue-100 text-red-700 rounded-lg text-sm font-semibold"
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            exit={{ scale: 0 }}
                          >
                            {filters.university}
                            <button
                              onClick={() => handleRemoveFilter('university', '')}
                              className="hover:bg-red-200 rounded-full p-0.5"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </motion.div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
          </motion.div>
          

          {/* Results Section */}
          <div className="lg:col-span-3">
            <motion.div
              variants={containerVariants}
              initial="hidden"
              animate="visible"
            >
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">
              {searchType === 'projects' 
                  ? `${projectResults.length} Projects` 
                  : `${userResults.length} People`
              }
            </h2>
              <p className="text-sm text-gray-600 mt-1">
                Search results
              </p>
            </div>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-xl text-sm font-medium focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="relevance">Most Relevant</option>
              <option value="recent">Most Recent</option>
              <option value="popular">Most Popular</option>
              <option value="rating">Highest Rated</option>
            </select>
          </div>

          {searchType === 'projects' ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {projectResults.map((project) => (
                <div
                  key={project.id}
                  className="bg-white rounded-2xl shadow-md border border-gray-100 hover:shadow-xl transition-all"
                >
                  <div className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <Link to={`/projects/${project.id}`}>
                          <h3 className="text-xl font-semibold text-gray-900 hover:text-red-600 transition-colors mb-2">
                          {project.title}
                        </h3>
                      </Link>
                        <span className={`inline-block px-2 py-1 rounded text-xs font-medium mb-2 ${
                          project.status === 'recruiting'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-blue-100 text-red-700'
                        }`}>
                          {formatStatus(project.status)}
                        </span>
                      </div>
                    </div>
                    
                    <p className="text-gray-600 text-sm mb-4">{project.description}</p>
                    
                    {/* Owner Info */}
                    <div className="flex items-center gap-3 mb-4 p-3 bg-gray-50 rounded-xl">
                      <div className="h-10 w-10 rounded-full bg-red-600 flex items-center justify-center text-white font-semibold">
                        {project.owner.full_name.charAt(0)}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900">{project.owner.full_name}</p>
                        <p className="text-xs text-gray-500 flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {project.owner.university}
                        </p>
                      </div>
                    </div>

                    {/* Skills */}
                    <div className="flex flex-wrap gap-2 mb-4">
                        {project.required_skills.map((skill, idx) => (
                          <span
                            key={idx}
                          className="px-3 py-1 bg-gray-100 text-gray-700 text-xs font-medium rounded-xl"
                          >
                            {skill}
                          </span>
                        ))}
                  </div>

                    {/* Footer */}
                    <div className="flex items-center justify-between pt-4 border-t border-gray-200">
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <Users className="h-4 w-4" />
                        <span>{project.current_team_size}/{project.team_size_limit} members</span>
                        <span className="text-green-600 font-medium">
                          ({project.team_size_limit - project.current_team_size} spots)
                        </span>
                      </div>
                      <Link to={`/projects/${project.id}`}>
                        <button className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-xl hover:bg-red-700 transition-colors">
                          View Project
                        </button>
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
          
          {/* Infinite scroll trigger for projects */}
          {searchType === 'projects' && (
            <div ref={loadMoreRef} className="py-8 text-center">
              {isFetchingNextProjects && (
                <div className="flex items-center justify-center gap-2 text-gray-600">
                  <Loader2 className="h-6 w-6 animate-spin text-red-600" />
                  <span>Loading more projects...</span>
                </div>
              )}
              {!hasNextProjects && projectResults.length > 0 && (
                <p className="text-gray-500 text-sm">You've reached the end 🎉</p>
              )}
            </div>
          )}
          
          {searchType === 'users' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {userResults.map((user) => (
                <div
                  key={user.id}
                  className="bg-white rounded-2xl shadow-md border border-gray-100 hover:shadow-xl transition-all"
                >
                  <div className="p-6 text-center">
                    <div className="h-16 w-16 rounded-full bg-red-600 flex items-center justify-center text-white text-2xl font-bold mx-auto mb-4">
                      {user.full_name.charAt(0)}
                    </div>
                    
                      <Link to={`/users/${user.id}`}>
                      <h3 className="text-lg font-semibold text-gray-900 hover:text-red-600 transition-colors mb-1">
                          {user.full_name}
                        </h3>
                      </Link>
                    <p className="text-sm text-gray-500 flex items-center justify-center gap-1 mb-2">
                        <MapPin className="h-3 w-3" />
                        {user.university}
                      </p>
                    <span className={`inline-block px-3 py-1 rounded text-xs font-medium mb-3 ${
                      user.role === 'project_leader'
                        ? 'bg-orange-100 text-orange-700'
                        : 'bg-blue-100 text-red-700'
                    }`}>
                      {user.role === 'project_leader' ? 'Project Leader' : 'Student'}
                      </span>

                    <p className="text-sm text-gray-600 mb-4 line-clamp-2">{user.bio}</p>

                    {/* Skills */}
                    <div className="flex flex-wrap gap-2 justify-center mb-4">
                      {user.skills.slice(0, 3).map((skill, idx) => (
                      <span
                        key={idx}
                          className="px-2 py-1 bg-gray-100 text-gray-700 text-xs font-medium rounded-xl"
                      >
                        {skill}
                      </span>
                    ))}
                      {user.skills.length > 3 && (
                        <span className="px-2 py-1 bg-gray-200 text-gray-700 text-xs font-medium rounded-xl">
                          +{user.skills.length - 3}
                        </span>
                      )}
                  </div>

                    {/* Footer */}
                    <div className="flex items-center justify-between pt-4 border-t border-gray-200">
                      <span className="text-sm text-gray-600 flex items-center gap-1">
                        <Briefcase className="h-4 w-4" />
                        {user.projects_count} projects
                      </span>
                    <Link to={`/users/${user.id}`}>
                        <button className="px-4 py-2 bg-red-600 text-white text-xs font-medium rounded-xl hover:bg-red-700 transition-colors">
                        View Profile
                        </button>
                    </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SearchPage;

