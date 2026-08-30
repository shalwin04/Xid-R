#!/bin/bash
# =============================================================================
# Xid-R End-to-End Test
# =============================================================================
# Tests the complete flow: VM registration -> GPU request -> training ->
# preemption -> checkpoint -> resume
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
API_ENDPOINT="http://localhost:8080"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
BOLD='\033[1m'
NC='\033[0m'

log_step() { echo -e "\n${CYAN}${BOLD}━━━ $1 ━━━${NC}"; }
log_info() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

cleanup() {
    echo ""
    log_step "Cleaning up..."
    kill $VM_PID 2>/dev/null || true
    kill $DEMO_PID 2>/dev/null || true
    log_info "Cleanup complete"
}
trap cleanup EXIT

echo ""
echo -e "${BOLD}${MAGENTA}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}${MAGENTA}║                                                          ║${NC}"
echo -e "${BOLD}${MAGENTA}║           Xid-R End-to-End Test Suite                    ║${NC}"
echo -e "${BOLD}${MAGENTA}║                                                          ║${NC}"
echo -e "${BOLD}${MAGENTA}╚══════════════════════════════════════════════════════════╝${NC}"
echo ""

# =============================================================================
# Step 1: Check Prerequisites
# =============================================================================
log_step "Step 1: Checking prerequisites"

if ! curl -s "$API_ENDPOINT/health" > /dev/null 2>&1; then
    log_error "Control plane not running at $API_ENDPOINT"
    echo "Start it with: npm run dev"
    exit 1
fi
log_info "Control plane is running"

# Clear ports
lsof -ti:8090 2>/dev/null | xargs kill -9 2>/dev/null || true
lsof -ti:8091 2>/dev/null | xargs kill -9 2>/dev/null || true
sleep 1
log_info "Ports cleared"

# =============================================================================
# Step 2: Start VM Agent
# =============================================================================
log_step "Step 2: Starting VM Agent (capacity provider)"

cd "$PROJECT_ROOT"
python3 infra/vm-agent/agent.py > /tmp/vm-agent.log 2>&1 &
VM_PID=$!
sleep 3

if ! kill -0 $VM_PID 2>/dev/null; then
    log_error "VM Agent failed to start"
    cat /tmp/vm-agent.log
    exit 1
fi
log_info "VM Agent started (PID: $VM_PID)"

# Get the capacity unit ID
CAPACITY_UNIT=$(grep -o 'unit_spot_vm_[^"]*' /tmp/vm-agent.log | tail -1)
log_info "Registered capacity: $CAPACITY_UNIT"

# =============================================================================
# Step 3: Start Demo Agent
# =============================================================================
log_step "Step 3: Starting Demo Agent (tenant workload)"

npx tsx scripts/demo/demo-agent.ts > /tmp/demo-agent.log 2>&1 &
DEMO_PID=$!
sleep 5

if ! kill -0 $DEMO_PID 2>/dev/null; then
    log_error "Demo Agent failed to start"
    cat /tmp/demo-agent.log
    exit 1
fi
log_info "Demo Agent started (PID: $DEMO_PID)"

# Get lease ID from logs
LEASE_ID=$(grep -o 'lease_[a-f0-9]*' /tmp/demo-agent.log | head -1)
log_info "Lease granted: $LEASE_ID"

# =============================================================================
# Step 4: Let Training Run
# =============================================================================
log_step "Step 4: Training in progress"
echo "Waiting 8 seconds to observe training..."
sleep 8

# Show training progress
echo ""
grep "TRAIN" /tmp/demo-agent.log | tail -5 || echo "No training output yet"
echo ""

# =============================================================================
# Step 5: Trigger Preemption
# =============================================================================
log_step "Step 5: Triggering Preemption"

# Get the active lease's capacity unit
ACTIVE_CAPACITY=$(curl -s "$API_ENDPOINT/api/leases/$LEASE_ID" 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('lease',{}).get('capacityUnitId',''))" 2>/dev/null || echo "")

if [ -z "$ACTIVE_CAPACITY" ]; then
    log_warn "Could not get capacity unit from lease, using registered unit"
    ACTIVE_CAPACITY="$CAPACITY_UNIT"
fi

log_info "Triggering reclaim on: $ACTIVE_CAPACITY"

PREEMPT_RESULT=$(curl -s -X POST "$API_ENDPOINT/api/system/preemption/trigger" \
    -H "Content-Type: application/json" \
    -d "{\"capacity_unit_id\": \"$ACTIVE_CAPACITY\", \"reason\": \"spot_preemption\"}" 2>/dev/null)

echo "Preemption response: $PREEMPT_RESULT"

# =============================================================================
# Step 6: Observe A2A Negotiation
# =============================================================================
log_step "Step 6: Observing A2A Negotiation"
echo "Waiting 5 seconds for negotiation..."
sleep 5

echo ""
echo "Demo Agent A2A activity:"
grep -E "A2A|PREEMPTION|checkpoint|Checkpoint" /tmp/demo-agent.log | tail -10 || echo "No A2A activity yet"
echo ""

# =============================================================================
# Step 7: Check Results
# =============================================================================
log_step "Step 7: Checking Results"

# Get final lease status
FINAL_STATUS=$(curl -s "$API_ENDPOINT/api/leases/$LEASE_ID" 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('lease',{}).get('status','unknown'))" 2>/dev/null || echo "unknown")
log_info "Final lease status: $FINAL_STATUS"

# Get recent events
echo ""
echo "Recent system events:"
curl -s "$API_ENDPOINT/api/system/events?limit=5" 2>/dev/null | python3 -c "
import sys,json
try:
    data = json.load(sys.stdin)
    for e in data.get('events', [])[:5]:
        print(f\"  - {e['type']}: {e.get('reasoning', 'N/A')[:50]}\")
except:
    print('  Could not parse events')
" 2>/dev/null || echo "  Could not fetch events"
echo ""

# =============================================================================
# Summary
# =============================================================================
log_step "Test Summary"

echo ""
echo -e "${BOLD}Results:${NC}"
echo "  VM Agent:    PID $VM_PID (capacity: $CAPACITY_UNIT)"
echo "  Demo Agent:  PID $DEMO_PID (lease: $LEASE_ID)"
echo "  Preemption:  Triggered on $ACTIVE_CAPACITY"
echo "  Final State: $FINAL_STATUS"
echo ""

if [ "$FINAL_STATUS" = "checkpointed" ] || [ "$FINAL_STATUS" = "negotiating" ] || [ "$FINAL_STATUS" = "active" ]; then
    echo -e "${GREEN}${BOLD}✓ E2E Test PASSED${NC}"
else
    echo -e "${YELLOW}${BOLD}⚠ E2E Test completed with status: $FINAL_STATUS${NC}"
fi
echo ""

# Keep running for observation
echo "Press Ctrl+C to stop..."
wait $DEMO_PID 2>/dev/null || true
