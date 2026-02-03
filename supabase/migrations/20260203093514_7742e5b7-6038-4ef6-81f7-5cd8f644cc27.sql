-- Rock Outcomes table (system-generated at quarter close)
CREATE TABLE public.rock_outcomes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    rock_id UUID NOT NULL,
    seat_id UUID REFERENCES public.accountability_seats(id) ON DELETE SET NULL,
    owner_id UUID, -- User who owned the rock at quarter close
    quarter_number INTEGER NOT NULL CHECK (quarter_number BETWEEN 1 AND 4),
    quarter_year INTEGER NOT NULL,
    outcome_type VARCHAR(30) NOT NULL CHECK (outcome_type IN ('completed_on_time', 'completed_late', 'rolled_forward', 'dropped')),
    rock_title TEXT NOT NULL, -- Snapshot of title at close
    completed_at TIMESTAMPTZ,
    due_date DATE,
    rolled_from_quarter VARCHAR(10), -- e.g. 'Q1 2026'
    rolled_to_quarter VARCHAR(10),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(rock_id, quarter_year, quarter_number)
);

-- Enable RLS
ALTER TABLE public.rock_outcomes ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view rock outcomes for their tenant"
ON public.rock_outcomes
FOR SELECT
USING (public.user_has_tenant_access(tenant_id));

CREATE POLICY "System can insert rock outcomes"
ON public.rock_outcomes
FOR INSERT
WITH CHECK (public.user_has_tenant_access(tenant_id));

-- Indexes
CREATE INDEX idx_rock_outcomes_tenant ON public.rock_outcomes(tenant_id);
CREATE INDEX idx_rock_outcomes_quarter ON public.rock_outcomes(quarter_year, quarter_number);
CREATE INDEX idx_rock_outcomes_seat ON public.rock_outcomes(seat_id);
CREATE INDEX idx_rock_outcomes_outcome ON public.rock_outcomes(outcome_type);

-- Create a function to generate rock outcomes for a quarter
CREATE OR REPLACE FUNCTION public.generate_rock_outcomes(
    p_tenant_id BIGINT,
    p_quarter_number INTEGER,
    p_quarter_year INTEGER
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count INTEGER := 0;
    v_rock RECORD;
    v_outcome_type VARCHAR(30);
    v_quarter_end DATE;
BEGIN
    -- Calculate quarter end date
    v_quarter_end := CASE p_quarter_number
        WHEN 1 THEN make_date(p_quarter_year, 3, 31)
        WHEN 2 THEN make_date(p_quarter_year, 6, 30)
        WHEN 3 THEN make_date(p_quarter_year, 9, 30)
        WHEN 4 THEN make_date(p_quarter_year, 12, 31)
    END;
    
    -- Process each rock for the quarter
    FOR v_rock IN 
        SELECT 
            r.id,
            r.title,
            r.seat_id,
            r.owner_id,
            r.status,
            r.completed_date,
            r.due_date
        FROM eos_rocks r
        WHERE r.tenant_id = p_tenant_id
          AND r.quarter_number = p_quarter_number
          AND r.quarter_year = p_quarter_year
          AND NOT EXISTS (
              SELECT 1 FROM rock_outcomes ro 
              WHERE ro.rock_id = r.id 
                AND ro.quarter_year = p_quarter_year 
                AND ro.quarter_number = p_quarter_number
          )
    LOOP
        -- Determine outcome type
        IF v_rock.status = 'Complete' THEN
            IF v_rock.completed_date IS NOT NULL AND v_rock.completed_date::date <= v_quarter_end THEN
                v_outcome_type := 'completed_on_time';
            ELSE
                v_outcome_type := 'completed_late';
            END IF;
        ELSIF v_rock.status IN ('Off_Track', 'At_Risk', 'On_Track', 'Not_Started') THEN
            -- Check if rock exists in next quarter (rolled)
            IF EXISTS (
                SELECT 1 FROM eos_rocks nr
                WHERE nr.tenant_id = p_tenant_id
                  AND nr.title = v_rock.title
                  AND (
                      (nr.quarter_year = p_quarter_year AND nr.quarter_number > p_quarter_number)
                      OR nr.quarter_year > p_quarter_year
                  )
            ) THEN
                v_outcome_type := 'rolled_forward';
            ELSE
                v_outcome_type := 'dropped';
            END IF;
        ELSE
            v_outcome_type := 'dropped';
        END IF;
        
        -- Insert outcome record
        INSERT INTO rock_outcomes (
            tenant_id,
            rock_id,
            seat_id,
            owner_id,
            quarter_number,
            quarter_year,
            outcome_type,
            rock_title,
            completed_at,
            due_date
        ) VALUES (
            p_tenant_id,
            v_rock.id,
            v_rock.seat_id,
            v_rock.owner_id,
            p_quarter_number,
            p_quarter_year,
            v_outcome_type,
            v_rock.title,
            v_rock.completed_date,
            v_rock.due_date
        );
        
        v_count := v_count + 1;
    END LOOP;
    
    RETURN v_count;
END;
$$;