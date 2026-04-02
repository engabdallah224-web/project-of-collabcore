import { motion } from 'framer-motion';
import { Users } from 'lucide-react';

const LoadingSpinner = ({ size = 'default', className = '' }) => {
  const sizeClasses = {
    sm: 'h-4 w-4',
    default: 'h-8 w-8',
    lg: 'h-12 w-12',
  };

  const containerSizes = {
    sm: 'p-1',
    default: 'p-2',
    lg: 'p-3',
  };

  return (
    <div className={`flex flex-col items-center justify-center gap-3 ${className}`}>
      <motion.div
        className="relative"
        animate={{ rotate: 360 }}
        transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
      >
        <div className="absolute inset-0 bg-red-600 rounded-xl blur-md opacity-40"></div>
        <div className={`relative bg-red-600 ${containerSizes[size]} rounded-xl shadow-lg`}>
          <Users className={`${sizeClasses[size]} text-white`} />
        </div>
      </motion.div>
      {size !== 'sm' && (
        <motion.span
          className="text-sm font-semibold"
          animate={{ color: ['#ef4444', '#ffffff', '#ef4444'] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
        >
          CollabCore
        </motion.span>
      )}
    </div>
  );
};

export default LoadingSpinner;

