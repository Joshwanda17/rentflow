import { useState, useEffect } from 'react';
import { Star } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

interface HouseRatingBadgeProps {
  houseId: string;
  className?: string;
}

export default function HouseRatingBadge({ houseId, className = '' }: HouseRatingBadgeProps) {
  const navigate = useNavigate();
  const [avg, setAvg] = useState(0);
  const [count, setCount] = useState(0);

  useEffect(() => {
    supabase
      .from('house_reviews')
      .select('rating')
      .eq('house_id', houseId)
      .then(({ data }) => {
        if (data && data.length > 0) {
          setCount(data.length);
          setAvg(data.reduce((s, r) => s + r.rating, 0) / data.length);
        }
      });
  }, [houseId]);

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        navigate(`/houses/${houseId}#reviews`);
      }}
      className={`flex items-center gap-1 bg-black/70 backdrop-blur-sm text-white text-[11px] font-semibold px-2 py-1 rounded-full hover:bg-black/90 transition-colors ${className}`}
      title={count > 0 ? `${avg.toFixed(1)} from ${count} reviews` : 'Be the first to review — visit & rate!'}
    >
      <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
      {count > 0 ? (
        <span>{avg.toFixed(1)} ({count})</span>
      ) : (
        <span>Rate</span>
      )}
    </button>
  );
}
