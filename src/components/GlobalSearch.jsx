import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Search, X, User, BookOpen, PhoneCall } from "lucide-react";
import { supabase } from "../api/supabase";

export default function GlobalSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState({ students: [], inquiries: [], batches: [] });
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const debounceRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const runSearch = useCallback(async (term) => {
    setLoading(true);
    setOpen(true);
    const [{ data: students }, { data: inquiries }, { data: batches }] = await Promise.all([
      supabase
        .from("students")
        .select("id, first_name, last_name, admission_no, photo_url")
        .or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%,admission_no.ilike.%${term}%`)
        .limit(3),
      supabase
        .from("inquiries")
        .select("id, inquiry_no, student_name, mobile")
        .or(`student_name.ilike.%${term}%,inquiry_no.ilike.%${term}%,mobile.ilike.%${term}%`)
        .limit(3),
      supabase
        .from("batches")
        .select("id, batch_name")
        .ilike("batch_name", `%${term}%`)
        .limit(3),
    ]);
    setResults({
      students: students || [],
      inquiries: inquiries || [],
      batches: batches || [],
    });
    setLoading(false);
  }, []);

  function handleSearch(value) {
    setQuery(value);
    clearTimeout(debounceRef.current);
    if (value.length < 2) {
      setResults({ students: [], inquiries: [], batches: [] });
      setOpen(false);
      return;
    }
    debounceRef.current = setTimeout(() => runSearch(value.toLowerCase()), 300);
  }

  function handleNavigate(path) {
    setOpen(false);
    setQuery("");
    navigate(path);
  }

  return (
    <div className="relative flex-1 max-w-md mx-4" ref={containerRef}>
      <div className="flex items-center bg-secondary-bg rounded-xl px-4 py-2">
        <Search size={18} className="text-secondary flex-shrink-0" />
        <input
          type="text"
          placeholder="Search students, inquiries, batches..."
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          className="bg-transparent outline-none ml-3 w-full text-sm text-secondary-dark placeholder-secondary-light"
        />
        {query && (
          <button onClick={() => { setQuery(""); setOpen(false); }} className="p-1">
            <X size={16} className="text-secondary" />
          </button>
        )}
      </div>

      {/* Results dropdown */}
      {open && (
        <div className="absolute top-full mt-2 w-full bg-white rounded-xl shadow-xl border border-secondary-light z-50 overflow-hidden max-h-80 overflow-y-auto">
          {loading ? (
            <div className="p-4 text-center text-sm text-secondary">Searching...</div>
          ) : (
            <>
              {/* Students */}
              {results.students.length > 0 && (
                <div>
                  <div className="px-4 py-2 text-xs font-montserrat text-secondary-dark bg-slate-50">
                    Students
                  </div>
                  {results.students.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => handleNavigate(`/students/${s.id}`)}
                      className="w-full text-left px-4 py-2.5 hover:bg-primary-bg transition flex items-center gap-3 border-b border-secondary-light last:border-0"
                    >
                      {s.photo_url ? (
                        <img src={s.photo_url} alt="" className="w-7 h-7 rounded-full object-cover" />
                      ) : (
                        <User size={18} className="text-secondary" />
                      )}
                      <div>
                        <p className="text-sm font-medium">{s.first_name} {s.last_name}</p>
                        <p className="text-xs text-secondary">{s.admission_no}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* Inquiries */}
              {results.inquiries.length > 0 && (
                <div>
                  <div className="px-4 py-2 text-xs font-montserrat text-secondary-dark bg-slate-50">
                    Inquiries
                  </div>
                  {results.inquiries.map((inq) => (
                    <button
                      key={inq.id}
                      onClick={() => handleNavigate(`/inquiries`)}
                      className="w-full text-left px-4 py-2.5 hover:bg-primary-bg transition flex items-center gap-3 border-b border-secondary-light last:border-0"
                    >
                      <PhoneCall size={18} className="text-secondary" />
                      <div>
                        <p className="text-sm font-medium">{inq.student_name}</p>
                        <p className="text-xs text-secondary">{inq.inquiry_no} – {inq.mobile}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* Batches */}
              {results.batches.length > 0 && (
                <div>
                  <div className="px-4 py-2 text-xs font-montserrat text-secondary-dark bg-slate-50">
                    Batches
                  </div>
                  {results.batches.map((b) => (
                    <button
                      key={b.id}
                      onClick={() => handleNavigate(`/batches`)}
                      className="w-full text-left px-4 py-2.5 hover:bg-primary-bg transition flex items-center gap-3 border-b border-secondary-light last:border-0"
                    >
                      <BookOpen size={18} className="text-secondary" />
                      <span className="text-sm font-medium">{b.batch_name}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* No results */}
              {!results.students.length && !results.inquiries.length && !results.batches.length && (
                <div className="p-4 text-center text-sm text-secondary">No results found</div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}