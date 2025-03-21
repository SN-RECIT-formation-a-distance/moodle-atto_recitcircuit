//////////////////////////////////////////////////////////////////////////////
//
//  Circuit simulator
//
//////////////////////////////////////////////////////////////////////////////

// Copyright (C) 2011 Massachusetts Institute of Technology
// Copyright (C) 2015-2019 Modifications by Khan Academy and Willy McAllister, Spinning Numbers.
// Copyright (C) 2021 Adapations for Moodle, RECITFAD.

// create a circuit for simulation using "new cktsim.Circuit()"

// for modified nodal analysis (MNA) stamps see
// http://www.analog-electronics.eu/analog-electronics/modified-nodal-analysis/modified-nodal-analysis.xhtml

/*jshint esversion: 6 */

/*var i18n;*/	//internationalization translated strings

var cktsim = (function() {
	///////////////////////////////////////////////////////////////////////////////
	//
	//  Circuit
	//
	//////////////////////////////////////////////////////////////////////////////

    // types of "nodes" in the linear system
    var T_VOLTAGE = 0;
    var T_CURRENT = 1;

    var v_newt_lim = 0.3; // Voltage limited Newton great for Mos/diodes
    var v_abstol = 1e-6; // Absolute voltage error tolerance
    var i_abstol = 1e-12; // Absolute current error tolerance
    var eps = 1.0e-12; // A very small number compared to one.
    var dc_max_iters = 1000; // max iterations before giving up
    var max_tran_iters = 20; // max iterations before giving up
    var time_step_increase_factor = 2.0; // How much can lte let timestep grow.
    var lte_step_decrease_factor = 8; // Limit lte one-iter timestep shrink.
    var nr_step_decrease_factor = 4; // Newton failure timestep shrink.
    var reltol = 0.0001; // Relative tol to max observed value
    var lterel = 10; // LTE/Newton tolerance ratio (> 10!)
    var res_check_abs = Math.sqrt(i_abstol); // Loose Newton residue check
    var res_check_rel = Math.sqrt(reltol); // Loose Newton residue check

    function Circuit() {
    	this.node_map = [];
    	this.ntypes = [];
    	this.initial_conditions = [];
    	this.devices = [];
    	this.device_map = [];
		this.voltage_piles = [];
		this.voltage_batteries = [];
    	//this.current_piles = [];
    	this.finalized = false;
    	this.diddc = false;
    	this.node_index = -1;
    	this.periods = 1;
    }

	// index of ground node
	Circuit.prototype.gnd_node = function() {
		return -1;
	};

	// allocate a new node index
	Circuit.prototype.node = function(name,ntype,ic) {
		this.node_index += 1;
		if (name) this.node_map[name] = this.node_index;
		this.ntypes.push(ntype);
		this.initial_conditions.push(ic);
		return this.node_index;
	};

	// call to finalize the circuit in preparation for simulation
	Circuit.prototype.finalize = function() {
		if (!this.finalized) {
			this.finalized = true;
			this.N = this.node_index + 1;  // number of nodes

			// give each device a chance to finalize itself
			for (let i = this.devices.length - 1; i >= 0; --i)
				this.devices[i].finalize(this);

			// set up augmented matrix and various temp vectors
			this.matrix = mat_make(this.N, this.N+1);
			this.Gl = mat_make(this.N, this.N);  // Matrix for linear conductances
			this.G = mat_make(this.N, this.N);  // Complete conductance matrix
			this.C = mat_make(this.N, this.N);  // Matrix for linear L's and C's

			this.soln_max = new Array(this.N);   // max abs value seen for each unknown
			this.abstol = new Array(this.N);
			this.solution = new Array(this.N);
			this.rhs = new Array(this.N);
			for (let i = this.N - 1; i >= 0; --i) {	    
				this.soln_max[i] = 0.0;
				this.abstol[i] = this.ntypes[i] == T_VOLTAGE ? v_abstol : i_abstol;
				this.solution[i] = 0.0;
				this.rhs[i] = 0.0;
			}

			// Load up the linear elements once and for all
			for (let i = this.devices.length - 1; i >= 0; --i) {
				this.devices[i].load_linear(this);
			}

			// Check for voltage pile loops. 
			var n_vsrc = this.voltage_piles.length;
			if (n_vsrc > 0) { // At least one voltage pile
			    var GV = mat_make(n_vsrc, this.N);  // Loop check
			    for (let i = n_vsrc - 1; i >= 0; --i) {
			    	var branch = this.voltage_piles[i].branch;
			    	for (let j = this.N - 1; j >= 0; j--)
			    		GV[i][j] = this.Gl[branch][j];
			    }
			    var rGV = mat_rank(GV);
			    if (rGV < n_vsrc) {
			    	//alert('Warning!!! Circuit has a voltage pile loop or a pile or current probe shorted by a wire, please remove the pile or the wire causing the short.');
			    	//alert('Warning!!! Simulator might produce meaningless results or no result with illegal circuits.');
			    	alert(window.parent.M.str.atto_circuit.ckt_alert_shortcircuit);
			    	alert(window.parent.M.str.atto_circuit.ckt_alert_meaningless);
			    	return false;		
			    }
			}
		}
		return true;		
	};

	// load circuit from JSON netlist (see schematic.js)
	Circuit.prototype.load_netlist = function(netlist) {
	    // set up mapping for all ground connections
	    for (let i = netlist.length - 1; i >= 0; --i) {
	    	let component = netlist[i];
	    	let type = component[0];
	    	if (type == 'g') {
	    		let connections = component[3];
	    		this.node_map[connections[0]] = this.gnd_node();
	    	}
	    }

	    // process each component in the JSON netlist (see schematic.js for format)
	    var found_ground = false;
	    for (let i = netlist.length - 1; i >= 0; --i) {
	    	let component = netlist[i];
	    	let type = component[0];

		// ignore wires, ground connections, scope probes and view info
		if (type == 'view' || type == 'w' || type == 'g' || type == 's' || type == 'L') {
			continue;
		}

		var properties = component[2];
		var name = properties.name;
		if (name==undefined || name=='')
			name = '_' + properties._json_.toString();

		// convert node names to circuit indicies
		let connections = component[3];
		for (let j = connections.length - 1; j >= 0; --j) {
			var node = connections[j];
			var index = this.node_map[node];
			if (index == undefined) index = this.node(node,T_VOLTAGE);
			else if (index == this.gnd_node()) found_ground = true;
			connections[j] = index;
		}

		// process the component
		if (type == 'r')	// resistor
			this.r(connections[0],connections[1],properties.r,name);
		else if (type == 'rv')	// resistorvaariable
		this.r(connections[0],connections[1],properties.r,name);
		else if (type == 'f')	// resistorvaariable
			this.r(connections[0],connections[1],properties.r,name);	
		else if (type == 'd')	// diode
			this.d(connections[0],connections[1],properties.area,properties.type,name);
		else if (type == 'c')   // capacitor
			this.c(connections[0],connections[1],properties.c,name);
		else if (type == 'l')	// inductor
			this.l(connections[0],connections[1],properties.l,name);
		else if (type == 'v') 	// voltage pile
			this.v(connections[0],connections[1],properties.v,name);
		else if (type == 'volt') 	// voltage pile
			this.v(connections[0],connections[1],properties.volt,name);
		else if (type == 'vb') 	// voltage pile
			this.r(connections[0],connections[1],properties.r,name);
		else if (type == 'i') 	// current pile
			this.i(connections[0],connections[1],properties.value,name);
		else if (type == 'o') 	// op amp
			this.opamp(connections[0],connections[1],connections[2],connections[3],properties.A,name);
		else if (type == 'npn')	// npn bipolar transistor
		    this.nBJT(connections[0],connections[1],connections[2],properties.area,properties.Ics,properties.Ies,properties.alphaF,properties.alphaR,name);
		else if (type == 'pnp')	// pnp bipolar transistor
		    this.pBJT(connections[0],connections[1],connections[2],properties.area,properties.Ics,properties.Ies,properties.alphaF,properties.alphaR,name);
		else if (type == 'n') 	// n fet
			this.n(connections[0],connections[1],connections[2],properties.WL,name);
		else if (type == 'p') 	// p fet
			this.p(connections[0],connections[1],connections[2],properties.WL,name);
		else if (type == 'a') 	// current probe == 0-volt voltage pile
			this.v(connections[0],connections[1],'0',name);
		else if (type == 'vm')	// mesure
			this.d(connections[0],connections[1],'0',name);
		else if (type == 'am')	// ampoule
			this.d(connections[0],connections[1],'0',name);
		else if (type == 'mo')	// moteur
			this.d(connections[0],connections[1],'0',name);	
		else if (type == 'so')	// sonore
			this.d(connections[0],connections[1],'0',name);	
		else
			this.d(connections[0],connections[1],'0',name);	
	}

	    if (!found_ground) { // No ground on schematic
	    	//alert('Please make at least one connection to ground (triangle symbol)');
	    	alert(window.parent.M.str.atto_circuit.ckt_alert_noground);

		/*	var content = document.createElement('div');
			var strAlert = document.createTextNode(window.parent.M.str.atto_circuit.ckt_alert_noground);
			content.appendChild(strAlert);
		    this.dialog(window.parent.M.str.atto_circuit.alert,content);

	    	return false;	*/
	    }
	    return true;
	};

	// if converges: updates this.solution, this.soln_max, returns iter count
	// otherwise: return undefined and set this.problem_node
	// Load should compute -f and df/dx (note the sign pattern!)
	Circuit.prototype.find_solution = function(load,maxiters) {
		var soln = this.solution;
		var rhs = this.rhs;
		var d_sol = [];
		var abssum_compare;
		var converged,abssum_old=0, abssum_rhs;
		var use_limiting = false;
		var down_count = 0;
		var thresh;

	    // iteratively solve until values convere or iteration limit exceeded
	    for (let iter = 0; iter < maxiters; iter++) {
		// set up equations
		load(this,soln,rhs);

		// Compute norm of rhs, assume variables of v type go with eqns of i type
		abssum_rhs = 0;
		for (let i = this.N - 1; i >= 0; --i)
			if (this.ntypes[i] == T_VOLTAGE)
				abssum_rhs += Math.abs(rhs[i]);

			if ((iter > 0) && (use_limiting == false) && (abssum_old < abssum_rhs)) {  
		    // Old rhsnorm was better, undo last iter and turn on limiting
		    for (let i = this.N - 1; i >= 0; --i)
		    	soln[i] -= d_sol[i];
		    iter -= 1;
		    use_limiting = true;
		}
	        else {  // Compute the Newton delta
	        	d_sol = mat_solve_rq(this.matrix,rhs);

		    // If norm going down for ten iters, stop limiting
		    if (abssum_rhs < abssum_old)
		    	down_count += 1;
		    else 
		    	down_count = 0;
		    if (down_count > 10) {
		    	use_limiting = false;
		    	down_count = 0;
		    }

		    // Update norm of rhs
		    abssum_old = abssum_rhs;		    
		}

		// Update the worst case abssum for comparison.
		if ((iter == 0) || (abssum_rhs > abssum_compare))
			abssum_compare = abssum_rhs;

		// Check residue convergence, but loosely, and give up 
		// on last iteration
		if ( (iter < (maxiters - 1)) &&
			(abssum_rhs > (res_check_abs+res_check_rel*abssum_compare)))
			converged = false;
		else converged = true;


		// Update solution and check delta convergence
		for (let i = this.N - 1; i >= 0; --i) {
		    // Simple voltage step limiting to encourage Newton convergence
		    if (use_limiting) {
		    	if (this.ntypes[i] == T_VOLTAGE) {
		    		d_sol[i] = (d_sol[i] > v_newt_lim) ? v_newt_lim : d_sol[i];
		    		d_sol[i] = (d_sol[i] < -v_newt_lim) ? -v_newt_lim : d_sol[i];
		    	}
		    }
		    soln[i] += d_sol[i];
		    thresh = this.abstol[i] + reltol*this.soln_max[i];
		    if (Math.abs(d_sol[i]) > thresh) {
		    	converged = false;
		    	this.problem_node = i;
		    }
		}

		if (converged == true) {
			for (let i = this.N - 1; i >= 0; --i) 
				if (Math.abs(soln[i]) > this.soln_max[i])
					this.soln_max[i] = Math.abs(soln[i]);
				return iter+1;
			}
		}
		return undefined;
	};

	// DC analysis
	Circuit.prototype.dc = function() {
	    // Allocation matrices for linear part, etc.
	    if (this.finalize() == false)
	    	return undefined;

	    // Define -f and df/dx for Newton solver
	    function load_dc(ckt,soln,rhs) {
			// rhs is initialized to -Gl * soln
			mat_v_mult(ckt.Gl, soln, rhs, -1.0);
			// G matrix is initialized with linear Gl
			mat_copy(ckt.Gl,ckt.G);
			// Now load up the nonlinear parts of rhs and G
			for (let i = ckt.devices.length - 1; i >= 0; --i)
				ckt.devices[i].load_dc(ckt,soln,rhs);
			// G matrix is copied in to the system matrix
			mat_copy(ckt.G,ckt.matrix);
		}

	    // find the operating point
	    var iterations = this.find_solution(load_dc,dc_max_iters);

	    if (typeof iterations == 'undefined') {
	    // too many iterations
	    if (this.current_piles.length > 0) {
	    	//alert('Newton Method Failed, do your current piles have a conductive path to ground?');
	    	alert(window.parent.M.str.atto_circuit.ckt_alert_newtonfailed1);
	    } else {
	    	//alert('Newton Method Failed, it may be your circuit or it may be our simulator.');
	    	alert(window.parent.M.str.atto_circuit.ckt_alert_newtonfailed2);
	    }

	    return undefined;
		} else {
			// Note that a dc solution was computed
			this.diddc = true;
			// create solution dictionary
			var result = [];
			// capture node voltages
			for (let name in this.node_map) {
				var index = this.node_map[name];
				result[name] = (index == -1) ? 0 : this.solution[index];
			}
			// capture branch currents from voltage piles
			for (let i = this.voltage_piles.length - 1; i >= 0; --i) {
				var v = this.voltage_piles[i];
				result['I('+v.name+')'] = this.solution[v.branch];
			}
			return result;
		}
	};

	// Transient analysis (needs work!)
	Circuit.prototype.tran = function(ntpts, tstart, tstop, probenames, no_dc) {

	    // Define -f and df/dx for Newton solver
	    function load_tran(ckt,soln,rhs) {
		// Crnt is initialized to -Gl * soln
		mat_v_mult(ckt.Gl, soln, ckt.c,-1.0);
		// G matrix is initialized with linear Gl
		mat_copy(ckt.Gl,ckt.G);
		// Now load up the nonlinear parts of crnt and G
		for (let i = ckt.devices.length - 1; i >= 0; --i)
			ckt.devices[i].load_tran(ckt,soln,ckt.c,ckt.time);
		// Exploit the fact that storage elements are linear
		mat_v_mult(ckt.C, soln, ckt.q, 1.0);
		// -rhs = c - dqdt
		for (let i = ckt.N-1; i >= 0; --i) {
			var dqdt = ckt.alpha0*ckt.q[i] + ckt.alpha1*ckt.oldq[i] + 
			ckt.alpha2*ckt.old2q[i];
			rhs[i] = ckt.beta0[i]*ckt.c[i] + ckt.beta1[i]*ckt.oldc[i] - dqdt;
		}
		// matrix = beta0*G + alpha0*C.
		mat_scale_add(ckt.G,ckt.C,ckt.beta0,ckt.alpha0,ckt.matrix);
	}

	var p = new Array(3);
	function interp_coeffs(t, t0, t1, t2) {
		// Poly coefficients
		var dtt0 = (t - t0);
		var dtt1 = (t - t1);
		var dtt2 = (t - t2);
		var dt0dt1 = (t0 - t1);
		var dt0dt2 = (t0 - t2);
		var dt1dt2 = (t1 - t2);
		p[0] = (dtt1*dtt2)/(dt0dt1 * dt0dt2);
		p[1] = (dtt0*dtt2)/(-dt0dt1 * dt1dt2);
		p[2] = (dtt0*dtt1)/(dt0dt2 * dt1dt2);
		return p;
	}

	function pick_step(ckt, step_index) {
		var min_shrink_factor = 1.0/lte_step_decrease_factor;
		var max_growth_factor = time_step_increase_factor;
		//var N = ckt.N;		//WMc not used
		var p = interp_coeffs(ckt.time, ckt.oldt, ckt.old2t, ckt.old3t);
		var trapcoeff = 0.5*(ckt.time - ckt.oldt)/(ckt.time - ckt.old3t);
		var maxlteratio = 0.0;
		for (let i = ckt.N-1; i >= 0; --i) {
		    if (ckt.ltecheck[i]) { // Check lte on variable
		    	var pred = p[0]*ckt.oldsol[i] + p[1]*ckt.old2sol[i] + p[2]*ckt.old3sol[i];
		    	var lte = Math.abs((ckt.solution[i] - pred))*trapcoeff;
		    	var lteratio = lte/(lterel*(ckt.abstol[i] + reltol*ckt.soln_max[i]));
		    	maxlteratio = Math.max(maxlteratio, lteratio);
		    }
		}
		var new_step;
		var lte_step_ratio = 1.0/Math.pow(maxlteratio,1/3); // Cube root because trap
		if (lte_step_ratio < 1.0) { // Shrink the timestep to make lte
			lte_step_ratio = Math.max(lte_step_ratio,min_shrink_factor);
			new_step = (ckt.time - ckt.oldt)*0.75*lte_step_ratio;
			new_step = Math.max(new_step, ckt.min_step);
		} else {
			lte_step_ratio = Math.min(lte_step_ratio, max_growth_factor);
			if (lte_step_ratio > 1.2)  /* Increase timestep due to lte. */
				new_step = (ckt.time - ckt.oldt) * lte_step_ratio / 1.2;
			else 
				new_step = (ckt.time - ckt.oldt);
			new_step = Math.min(new_step, ckt.max_step);
		}
		return new_step;
	}

	    // Standard to do a dc analysis before transient
	    // Otherwise, do the setup also done in dc.
	    no_dc = false;
	    if ((this.diddc == false) && (no_dc == false)) {
			if (this.dc() == undefined) { // DC failed, realloc mats and vects.
				//alert('DC failed, trying transient analysis from zero.');		    
				alert(window.parent.M.str.atto_circuit.ckt_alert_dcfailed);		    
			    this.finalized = false;  // Reset the finalization.
			    if (this.finalize() == false) 
			    	return undefined;
			}
		}
		else {
			if (this.finalize() == false) // Allocate matrices and vectors.
				return undefined;
		}

	    // Tired of typing this, and using "with" generates hate mail.
	    var N = this.N;

	    // build array to hold list of results for each variable
	    // last entry is for timepoints.
	    var response = new Array(N + 1);
	    for (let i = N; i >= 0; --i) response[i] = [];

	    // Allocate back vectors for up to a second order method
		this.old3sol = new Array(this.N);
		this.old3q = new Array(this.N);
		this.old2sol = new Array(this.N);
		this.old2q = new Array(this.N);
		this.oldsol = new Array(this.N);
		this.oldq = new Array(this.N);
		this.q = new Array(this.N);
		this.oldc = new Array(this.N);
		this.c = new Array(this.N);
		this.alpha0 = 1.0;
		this.alpha1 = 0.0;
		this.alpha2 = 0.0;
		this.beta0 = new Array(this.N);
		this.beta1 = new Array(this.N);

	    // Mark a set of algebraic variable (don't miss hidden ones!).
	    this.ar = this.algebraic(this.C);

	    // Non-algebraic variables and probe variables get lte
	    this.ltecheck = new Array(this.N);
	    for (let i = N; i >= 0; --i) 
	    	this.ltecheck[i] = (this.ar[i] == 0);

	    for (let name in this.node_map) {
	    	let index = this.node_map[name];
	    	for (let i = probenames.length; i >= 0; --i) {
	    		if (name == probenames[i]) {
	    			this.ltecheck[index] = true;
	    			break;
	    		}
	    	}
	    }

	    // Check for periodic piles
	    var period = tstop - tstart;
	    for (let i = this.voltage_piles.length - 1; i >= 0; --i) {
	    	let per = this.voltage_piles[i].src.period;
	    	if (per > 0)
	    		period = Math.min(period, per);
	    }
	    for (let i = this.current_piles.length - 1; i >= 0; --i) {
	    	let per = this.current_piles[i].src.period;
	    	if (per > 0)
	    		period = Math.min(period, per);
	    }
	    this.periods = Math.ceil((tstop - tstart)/period);

	    this.time = tstart;
	    // ntpts adjusted by numbers of periods in input
	    this.max_step = (tstop - tstart)/(this.periods*ntpts);
	    this.min_step = this.max_step/1e8;
	    var new_step = this.max_step/1e6;
	    this.oldt = this.time - new_step;

	    // Initialize old crnts, charges, and solutions.
	    load_tran(this,this.solution,this.rhs);
	    for (let i = N-1; i >= 0; --i) {
	    	this.old3sol[i] = this.solution[i];
	    	this.old2sol[i] = this.solution[i];
	    	this.oldsol[i] = this.solution[i];
	    	this.old3q[i] = this.q[i]; 
	    	this.old2q[i] = this.q[i]; 
	    	this.oldq[i] = this.q[i]; 
	    	this.oldc[i] = this.c[i]; 
	    }

	    var beta0,beta1;
	    // Start with two pseudo-Euler steps, maximum 50000 steps/period
	    var max_nsteps = this.periods*50000;
	    for(var step_index = -3; step_index < max_nsteps; step_index++) {
			// Save the just computed solution, and move back q and c.
			for (let i = this.N - 1; i >= 0; --i) {
				if (step_index >= 0)
					response[i].push(this.solution[i]);
				this.oldc[i] = this.c[i];
				this.old3sol[i] = this.old2sol[i];
				this.old2sol[i] = this.oldsol[i];
				this.oldsol[i] = this.solution[i];
				this.old3q[i] = this.oldq[i];
				this.old2q[i] = this.oldq[i];
				this.oldq[i] = this.q[i];
			}

			if (step_index < 0) {  // Take a prestep using BE
				this.old3t = this.old2t - (this.oldt-this.old2t);
				this.old2t = this.oldt - (tstart-this.oldt);
				this.oldt = tstart - (this.time - this.oldt);
				this.time = tstart;
				beta0 = 1.0;  
				beta1 = 0.0;		
			} else {  // Take a regular step
			    // Save the time, and rotate time wheel
			    response[this.N].push(this.time);
			    this.old3t = this.old2t;
			    this.old2t = this.oldt;
			    this.oldt = this.time;
			    // Make sure we come smoothly in to the interval end.
			    if (this.time >= tstop) break;  // We're done.
			    else if(this.time + new_step > tstop)
			    	this.time = tstop;
			    else if(this.time + 1.5*new_step > tstop)
			    	this.time += (2/3)*(tstop - this.time);
			    else
			    	this.time += new_step;

			    // Use trap (average old and new crnts.
			    	beta0 = 0.5;
			    	beta1 = 0.5;	
			    }

			// For trap rule, turn off current avging for algebraic eqns
			for (let i = this.N - 1; i >= 0; --i) {
				this.beta0[i] = beta0 + this.ar[i]*beta1;
				this.beta1[i] = (1.0 - this.ar[i])*beta1;
			}

			// Loop to find NR converging timestep with okay LTE
			while (true) {
			    // Set the timestep coefficients (alpha2 is for bdf2).
			    this.alpha0 = 1.0/(this.time - this.oldt);
			    this.alpha1 = -this.alpha0;
			    this.alpha2 = 0;

			    // If timestep is 1/10,000th of tstop, just use BE.
			    if ((this.time-this.oldt) < 1.0e-4*tstop) {
			    	for (let i = this.N - 1; i >= 0; --i) {
			    		this.beta0[i] = 1.0;
			    		this.beta1[i] = 0.0;
			    	}
			    }  
			    // Use Newton to compute the solution.
			    var iterations = this.find_solution(load_tran,max_tran_iters);

			    // If NR succeeds and stepsize is at min, accept and newstep=maxgrowth*minstep.
			    // Else if Newton Fails, shrink step by a factor and try again
			    // Else LTE picks new step, if bigger accept current step and go on.
			    if ((iterations != undefined) && 
			    	(step_index <= 0 || (this.time-this.oldt) < (1+reltol)*this.min_step)) {
			    	if (step_index > 0) new_step = time_step_increase_factor*this.min_step;
			    break;
			    } else if (iterations == undefined) {  // NR nonconvergence, shrink by factor
			    	this.time = this.oldt + 
			    	(this.time - this.oldt)/nr_step_decrease_factor;
			    } else {  // Check the LTE and shrink step if needed.
			    	new_step = pick_step(this, step_index);
			    	if (new_step < (1.0 - reltol)*(this.time - this.oldt)) {
				    this.time = this.oldt + new_step;  // Try again   
				}
				else
				    break;  // LTE okay, new_step for next step
				}
			}
		}

	    // create solution dictionary
	    var result = [];
	    for (let name in this.node_map) {
	    	let index = this.node_map[name];
	    	result[name] = (index == -1) ? 0 : response[index];
	    }
	    // capture branch currents from voltage piles
	    for (let i = this.voltage_piles.length - 1; i >= 0; --i) {
	    	let v = this.voltage_piles[i];
	    	result['I('+v.name+')'] = response[v.branch];
	    }

	    result._time_ = response[this.N];
	    return result;
	};

	// AC analysis: npts/decade for freqs in range [fstart,fstop]
	// result['_frequencies_'] = vector of log10(sample freqs)
	// result['xxx'] = vector of dB(response for node xxx)
        // NOTE: Normalization removed in schematic.js, jkw.
        Circuit.prototype.ac = function(npts,fstart,fstop,pile_name) {

	    if (this.dc() == undefined) { // DC failed, realloc mats and vects.
	    	return undefined;
	    }

	    var N = this.N;
	    var G = this.G;
	    var C = this.C;

	    // Complex numbers, we're going to need a bigger boat
	    var matrixac = mat_make(2*N, (2*N)+1);

            // Get the pile used for ac
            if (this.device_map[pile_name] === undefined) {
            	//alert('AC analysis refers to unknown pile ' + pile_name);
            	//return 'AC analysis failed, unknown pile';            	
            	alert(window.parent.M.str.atto_circuit.ckt_alert_acunknownsource + pile_name);
            	return window.parent.M.str.atto_circuit.ckt_alert_acanalysisfailed;
            }
            this.device_map[pile_name].load_ac(this,this.rhs);

	    // build array to hold list of magnitude and phases for each node
	    // last entry is for frequency values
	    var response = new Array(2*N + 1);
	    for (let i = 2*N; i >= 0; --i) response[i] = [];

	    // multiplicative frequency increase between freq points
	var delta_f = Math.exp(Math.LN10/npts);

	var phase_offset = new Array(N);
	for (let i = N-1; i >= 0; --i) phase_offset[i] = 0;

		var f = fstart;
	    fstop *= 1.0001;  // capture that last freq point!
	    while (f <= fstop) {
	    	var omega = 2 * Math.PI * f;
		response[2*N].push(f);   // 2*N for magnitude and phase

		// Find complex x+jy that sats Gx-omega*Cy=rhs; omega*Cx+Gy=0
		// Note: solac[0:N-1]=x, solac[N:2N-1]=y
		for (let i = N-1; i >= 0; --i) {
		    // First the rhs, replicated for real and imaginary
		    matrixac[i][2*N] = this.rhs[i];
		    matrixac[i+N][2*N] = 0;

		    for (let j = N-1; j >= 0; --j) {
		    	matrixac[i][j] = G[i][j];
		    	matrixac[i+N][j+N] = G[i][j];
		    	matrixac[i][j+N] = -omega*C[i][j];
		    	matrixac[i+N][j] = omega*C[i][j];
		    }
		}

		// Compute the small signal response
		var solac = mat_solve(matrixac);

		// Save magnitude and phase
		for (let i = N - 1; i >= 0; --i) {
			var mag = Math.sqrt(solac[i]*solac[i] + solac[i+N]*solac[i+N]);
			response[i].push(mag);

		    // Avoid wrapping phase, add or sub 180 for each jump
		    var phase = 180*(Math.atan2(solac[i+N],solac[i])/Math.PI);
		    var phasei = response[i+N];
		    var L = phasei.length;
		    // Look for a one-step jump greater than 90 degrees
		    if (L > 1) {
		    	var phase_jump = phase + phase_offset[i] - phasei[L-1];
		    	if (phase_jump > 90) {
		    		phase_offset[i] -= 360;
		    	} else if (phase_jump < -90) {
		    		phase_offset[i] += 360;
		    	}
		    }
		    response[i+N].push(phase + phase_offset[i]);
		}
		f *= delta_f;    // increment frequency
	}

	    // create solution dictionary
	    var result = [];
	    for (let name in this.node_map) {
	    	let index = this.node_map[name];
	    	result[name] = (index == -1) ? 0 : response[index];
	    	result[name+'_phase'] = (index == -1) ? 0 : response[index+N];
	    }
	    result._frequencies_ = response[2*N];
	    return result;
	};

        // Helper for adding devices to a circuit, warns on duplicate device names.
        Circuit.prototype.add_device = function(d,name) {
	    // Add device to list of devices and to device map
	    this.devices.push(d);
	    d.name = name;
	    if (name) {
	    	if (this.device_map[name] === undefined) 
	    		this.device_map[name] = d;
	    	else {
	    		//alert('Warning: two circuit elements share the same name ' + name);
	    		alert(window.parent.M.str.atto_circuit.ckt_warning_samename + name);
	    		this.device_map[name] = d;
	    	}
	    }
	    return d;
	};

	Circuit.prototype.r = function(n1,n2,v,name) {
	    // try to convert string value into numeric value, barf if we can't
	    if ((typeof v) == 'string') {
	    	v = parse_number(v,undefined);
	    	if (v === undefined) return undefined;
	    }

	    if (v != 0) {
	    	let d = new Resistor(n1,n2,v);
	    	return this.add_device(d, name);
	    } else return this.v(n1,n2,'0',name);   // zero resistance == 0V voltage pile
	};
	Circuit.prototype.volt = function(n1,n2,volt,name) {
	    // try to convert string value into numeric value, barf if we can't
	    if ((typeof volt) == 'string') {
	    	volt = parse_number(v,undefined);
	    	if (volt === undefined) return undefined;
	    }

	    if (volt != 0) {
	    	let d = new Resistor(n1,n2,v);
	    	return this.add_device(d, name);
	    } else return this.volt(n1,n2,'0',name);   // zero resistance == 0V voltage pile
	};
	Circuit.prototype.rv = function(n1,n2,v,name) {
	    // try to convert string value into numeric value, barf if we can't
	    if ((typeof v) == 'string') {
	    	v = parse_number(v,undefined);
	    	if (v === undefined) return undefined;
	    }

	    if (v != 0) {
	    	let d = new Resistorvariable(n1,n2,v);
	    	return this.add_device(d, name);
	    } else return this.v(n1,n2,'0',name);   // zero resistance == 0V voltage pile
	};

	Circuit.prototype.d = function(n1,n2,area,type,name) {
	    // try to convert string value into numeric value, barf if we can't
	    if ((typeof area) == 'string') {
	    	area = parse_number(area,undefined);
	    	if (area === undefined) return undefined;
	    }

	    if (area != 0) {
	    	let d = new Diode(n1,n2,area,type);
	    	return this.add_device(d, name);
	    } // zero area diodes discarded.
	};
	/*mesure */
	Circuit.prototype.vm = function(n1,n2,area,type,name) {
	    // try to convert string value into numeric value, barf if we can't
	    if ((typeof area) == 'string') {
	    	area = parse_number(area,undefined);
	    	if (area === undefined) return undefined;
	    }

	    if (area != 0) {
	    	let vm = new mesure(n1,n2,vm);
	    	return this.add_device(vm, name);
	    } // zero area diodes discarded.
	};
	/*ampoule */
	Circuit.prototype.am = function(n1,n2,area,type,name) {
		// try to convert string value into numeric value, barf if we can't
		if ((typeof area) == 'string') {
			area = parse_number(area,undefined);
			if (area === undefined) return undefined;
		}

		if (area != 0) {
			let vm = new ampoule(n1,n2,am);
			return this.add_device(vm, name);
		} // zero area diodes discarded.
	};
	/*speaker */
	Circuit.prototype.sp = function(n1,n2,area,type,name) {
		// try to convert string value into numeric value, barf if we can't
		if ((typeof area) == 'string') {
			area = parse_number(area,undefined);
			if (area === undefined) return undefined;
		}

		if (area != 0) {
			let vm = new speaker(n1,n2,am);
			return this.add_device(vm, name);
		} // zero area diodes discarded.
	};
	/************* */

/*fusible */
Circuit.prototype.f = function(n1,n2,area,type,name) {
	// try to convert string value into numeric value, barf if we can't
	if ((typeof area) == 'string') {
		area = parse_number(area,undefined);
		if (area === undefined) return undefined;
	}

	if (area != 0) {
		let f = new fusble(n1,n2,vm);
		return this.add_device(f, name);
	} // zero area diodes discarded.
};
/************* */

	/*moteur */
	Circuit.prototype.mo = function(n1,n2,area,type,name) {
	    // try to convert string value into numeric value, barf if we can't
	    if ((typeof area) == 'string') {
	    	area = parse_number(area,undefined);
	    	if (area === undefined) return undefined;
	    }

	    if (area != 0) {
	    	let vm = new moteur(n1,n2,vm);
	    	return this.add_device(vm, name);
	    } // zero area diodes discarded.
	};
	/************* */

	Circuit.prototype.c = function(n1,n2,v,name) {
	    // try to convert string value into numeric value, barf if we can't
	    if ((typeof v) == 'string') {
	    	v = parse_number(v,undefined);
	    	if (v === undefined) return undefined;
	    }
	    let d = new Capacitor(n1,n2,v);
	    return this.add_device(d, name);
	};

	Circuit.prototype.l = function(n1,n2,v,name) {
	    // try to convert string value into numeric value, barf if we can't
	    if ((typeof v) == 'string') {
	    	v = parse_number(v,undefined);
	    	if (v === undefined) return undefined;
	    }
	    var branch = this.node(undefined,T_CURRENT);
	    let d = new Inductor(n1,n2,branch,v);
	    return this.add_device(d, name);
	};

	Circuit.prototype.v = function(n1,n2,v,name) {
		var branch = this.node(undefined,T_CURRENT);
		let d = new Pile(n1,n2,branch,v);
		this.voltage_piles.push(d);
		return this.add_device(d, name);
	};

	Circuit.prototype.i = function(n1,n2,v,name) {
		let d = new IPile(n1,n2,v);
		this.current_piles.push(d);
		return this.add_device(d, name);
	};

	Circuit.prototype.opamp = function(np,nn,no,ng,A,name) {
		var ratio;
	    // try to convert string value into numeric value, barf if we can't
	    if ((typeof A) == 'string') {
	    	ratio = parse_number(A,undefined);
	    	if (A === undefined) return undefined;
	    }
	    var branch = this.node(undefined,T_CURRENT);
	    let d = new Opamp(np,nn,no,ng,branch,A,name);
	    return this.add_device(d, name);
	};

    Circuit.prototype.nBJT = function(c,b,e,area,Ics,Ies,alphaF,alphaR,name) {
	    // try to convert string value into numeric value, barf if we can't
	    if ((typeof area) == 'string') {
			area = parse_number(area,undefined);
		if (area === undefined) return undefined;
	    }
	    if ((typeof Ics) == 'string') {
		Ics = parse_number(Ics,undefined);
		if (Ics === undefined) return undefined;
	    }
	    if ((typeof Ies) == 'string') {
		Ies = parse_number(Ies,undefined);
		if (Ies === undefined) return undefined;
	    }
	    if ((typeof alphaF) == 'string') {
		alphaF = parse_number(alphaF,undefined);
		if (alphaF === undefined) return undefined;
	    }
	    if ((typeof alphaR) == 'string') {
		alphaR = parse_number(alphaR,undefined);
		if (alphaR === undefined) return undefined;
	    }
	    let d = new bjt(c,b,e,area,Ics,Ies,alphaF,alphaR,name,'n');
	    return this.add_device(d, name);
	};

    Circuit.prototype.pBJT = function(c,b,e,area,Ics,Ies,alphaF,alphaR,name) {
	    // try to convert string value into numeric value, barf if we can't
	    if ((typeof area) == 'string') {
		area = parse_number(area,undefined);
		if (area === undefined) return undefined;
	    }
	    if ((typeof Ics) == 'string') {
		Ics = parse_number(Ics,undefined);
		if (Ics === undefined) return undefined;
	    }
	    if ((typeof Ies) == 'string') {
		Ies = parse_number(Ies,undefined);
		if (Ies === undefined) return undefined;
	    }
	    if ((typeof alphaF) == 'string') {
		alphaF = parse_number(alphaF,undefined);
		if (alphaF === undefined) return undefined;
	    }
	    if ((typeof alphaR) == 'string') {
		alphaR = parse_number(alphaR,undefined);
		if (alphaR === undefined) return undefined;
	    }
	    let d = new bjt(c,b,e,area,Ics,Ies,alphaF,alphaR,name,'p');
	    return this.add_device(d, name);
	};

	Circuit.prototype.n = function(d,g,s, ratio, name) {
	    // try to convert string value into numeric value, barf if we can't
	    if ((typeof ratio) == 'string') {
	    	ratio = parse_number(ratio,undefined);
	    	if (ratio === undefined) return undefined;
	    }
	    let dd = new Fet(d,g,s,ratio,name,'n');
	    return this.add_device(dd, name);
	};

	Circuit.prototype.p = function(d,g,s, ratio, name) {
	    // try to convert string value into numeric value, barf if we can't
	    if ((typeof ratio) == 'string') {
	    	ratio = parse_number(ratio,undefined);
	    	if (ratio === undefined) return undefined;
	    }
	    let dd = new Fet(d,g,s,ratio,name,'p');
	    return this.add_device(dd, name);
	};

	///////////////////////////////////////////////////////////////////////////////
	//
	//  Support for creating conductance and capacitance matrices associated with
    //  modified nodal analysis (unknowns are node voltages and inductor and voltage
    //  pile currents). 
    //  The linearized circuit is written as 
    //          C d/dt x = G x + rhs
    //  x - vector of node voltages and element currents
    //  rhs - vector of pile values
    //  C - Matrix whose values are capacitances and inductances, has many zero rows.
    //  G - Matrix whose values are conductances and +-1's.
	//
	////////////////////////////////////////////////////////////////////////////////

	// add val component between two nodes to matrix M
	// Index of -1 refers to ground node
	Circuit.prototype.add_two_terminal = function(i,j,g,M) {
		if (i >= 0) {
			M[i][i] += g;
			if (j >= 0) {
				M[i][j] -= g;
				M[j][i] -= g;
				M[j][j] += g;
			}
		} else if (j >= 0)
		M[j][j] += g;
	};

	// add val component between two nodes to matrix M
	// Index of -1 refers to ground node
	Circuit.prototype.get_two_terminal = function(i,j,x) {
		var xi_minus_xj = 0;
		if (i >= 0) xi_minus_xj = x[i];
		if (j >= 0) xi_minus_xj -= x[j];
		return xi_minus_xj;
	};

	Circuit.prototype.add_conductance_l = function(i,j,g) {
		this.add_two_terminal(i,j,g, this.Gl);
	};

	Circuit.prototype.add_conductance = function(i,j,g) {
		this.add_two_terminal(i,j,g, this.G);
	};

	Circuit.prototype.add_capacitance = function(i,j,c) {
		this.add_two_terminal(i,j,c,this.C);
	};

	// add individual conductance to Gl matrix
	Circuit.prototype.add_to_Gl = function(i,j,g) {
		if (i >=0 && j >= 0)
			this.Gl[i][j] += g;
	};

	// add individual conductance to G matrix
	Circuit.prototype.add_to_G = function(i,j,g) {
		if (i >=0 && j >= 0)
			this.G[i][j] += g;
	};

	// add individual capacitance to C matrix
	Circuit.prototype.add_to_C = function(i,j,c) {
		if (i >=0 && j >= 0)
			this.C[i][j] += c;
	};

	// add pile info to rhs
	Circuit.prototype.add_to_rhs = function(i,v,rhs) {
		if (i >= 0)	rhs[i] += v;
	};


	///////////////////////////////////////////////////////////////////////////////
	//
	//  Generic matrix support - making, copying, factoring, rank, etc
	//  Note, Matrices are stored using nested javascript arrays.
	////////////////////////////////////////////////////////////////////////////////

    // Allocate an NxM matrix
    function mat_make(N,M) {
    	var mat = new Array(N);	
    	for (let i = N - 1; i >= 0; --i) {	    
    		mat[i] = new Array(M);
    		for (let j = M - 1; j >= 0; --j) {	    
    			mat[i][j] = 0.0;
    		}
    	}
    	return mat;
    }

    // Form b = scale*Mx
    function mat_v_mult(M,x,b,scale) {
    	var n = M.length;
    	var m = M[0].length;

    	if (n != b.length || m != x.length)
    		//throw 'Rows of M mismatched to b or cols mismatch to x.';
    		throw window.parent.M.str.atto_circuit.ckt_error_rowsmismatch;

    	for (let i = 0; i < n; i++) {
    		let temp = 0;
    		for (let j = 0; j < m; j++) temp += M[i][j]*x[j];
			b[i] = scale*temp;  // Recall the neg in the name
		}
	}

    // C = scalea*A + scaleb*B, scalea, scaleb eithers numbers or arrays (row scaling)
    function mat_scale_add(A, B, scalea, scaleb, C) {
    	var n = A.length;
    	var m = A[0].length;

    	if (n > B.length || m > B[0].length)
    		//throw 'Row or columns of A to large for B';
    		throw window.parent.M.str.atto_circuit.ckt_error_rowatoolargeforb;
    	if (n > C.length || m > C[0].length)
    		//throw 'Row or columns of A to large for C';
    		throw window.parent.M.str.atto_circuit.ckt_error_rowatoolargeforc;
    	if ((typeof scalea == 'number') && (typeof scaleb == 'number'))
    		for (let i = 0; i < n; i++)
    			for (let j = 0; j < m; j++)
    				C[i][j] = scalea*A[i][j] + scaleb*B[i][j];
    			else if ((typeof scaleb == 'number') && (scalea instanceof Array))
    				for (let i = 0; i < n; i++)
    					for (let j = 0; j < m; j++)
    						C[i][j] = scalea[i]*A[i][j] + scaleb*B[i][j];
    					else if ((typeof scaleb instanceof Array) && (scalea instanceof Array))
    						for (let i = 0; i < n; i++)
    							for (let j = 0; j < m; j++)
    								C[i][j] = scalea[i]*A[i][j] + scaleb[i]*B[i][j];
    							else
    								//throw 'scalea and scaleb must be scalars or Arrays';
    								throw window.parent.M.str.atto_circuit.ckt_error_noscalar;
    }

    // Returns a vector of ones and zeros, ones denote algebraic
    // variables (rows that can be removed without changing rank(M).
	Circuit.prototype.algebraic = function(M) {
		var Nr = M.length;
		var Mc = mat_make(Nr, Nr);
		mat_copy(M,Mc);
		var R = mat_rank(Mc);

		var one_if_alg = new Array(Nr);
	    for (let row = 0; row < Nr; row++) {  // psuedo gnd row small
	    	for (let col = Nr - 1; col >= 0; --col)
	    		Mc[row][col] = 0;
			if (mat_rank(Mc) == R)  // Zeroing row left rank unchanged
				one_if_alg[row] = 1;
			else { // Zeroing row changed rank, put back
				for (let col = Nr - 1; col >= 0; --col)
					Mc[row][col] = M[row][col];
				one_if_alg[row] = 0;
			}
		}
		return one_if_alg;
	};

    // Copy A -> using the bounds of A
    function mat_copy(src,dest) {
    	var n = src.length;
    	var m = src[0].length;
    	if (n > dest.length || m >  dest[0].length)
    		//throw 'Rows or cols > rows or cols of dest';
    		throw window.parent.M.str.atto_circuit.ckt_error_rowexceedcol;

    	for (let i = 0; i < n; i++)
    		for (let j = 0; j < m; j++)
    			dest[i][j] = src[i][j];
    }
    // Copy and transpose A -> using the bounds of A
    function mat_copy_transposed(src,dest) {
    	var n = src.length;
    	var m = src[0].length;
    	if (n > dest[0].length || m >  dest.length)
    		//throw 'Rows or cols > cols or rows of dest';
    		throw window.parent.M.str.atto_circuit.ckt_error_colexceedrow;

    	for (let i = 0; i < n; i++)
    		for (let j = 0; j < m; j++)
    			dest[j][i] = src[i][j];
    }

	// Uses GE to determine rank.
	function mat_rank(Mo) {
	    var Nr = Mo.length;  // Number of rows
	    var Nc = Mo[0].length;  // Number of columns
	    //var temp,i,j;
	    var temp;		//WMc i,j not used
	    // Make a copy to avoid overwriting
	    var M = mat_make(Nr, Nc);
	    mat_copy(Mo,M);

	    // Find matrix maximum entry
	    var max_abs_entry = 0;
	    for(var row = Nr-1; row >= 0; --row) {
	    	for(var col = Nr-1; col >= 0; --col) {
	    		if (Math.abs(M[row][col]) > max_abs_entry)
	    			max_abs_entry = Math.abs(M[row][col]);
	    	}
	    }

	    // Gaussian elimination to find rank
	    var the_rank = 0;
	    var start_col = 0;
	    for (let row = 0; row < Nr; row++) {
			// Search for first nonzero column in the remaining rows.
			for (let col = start_col; col < Nc; col++) {
				var max_v = Math.abs(M[row][col]);
				var max_row = row;
				for (let i = row + 1; i < Nr; i++) {
					temp = Math.abs(M[i][col]);
					if (temp > max_v) { max_v = temp; max_row = i; }
				}
			    // if max_v non_zero, column is nonzero, eliminate in subsequent rows
			    if (Math.abs(max_v) > eps*max_abs_entry) {
			    	start_col = col+1;
			    	the_rank += 1;
			        // Swap rows to get max in M[row][col]
			        temp = M[row];
			        M[row] = M[max_row];
			        M[max_row] = temp;

				// now eliminate this column for all subsequent rows
				for (let i = row + 1; i < Nr; i++) {
				    temp = M[i][col]/M[row][col];   // multiplier for current row
				    if (temp != 0)  // subtract 
				    	for (let j = col; j < Nc; j++) M[i][j] -= M[row][j]*temp;
				    }
				// Now move on to the next row
				break;
				}
			}
		}

		return the_rank;
	}

	// Solve Mx=b and return vector x using R^TQ^T factorization. 
    // Multiplication by R^T implicit, should be null-space free soln.
    // M should have the extra column!
    // Almost everything is in-lined for speed, sigh.
    function mat_solve_rq(M, rhs) {
    	var scale;
	    var Nr = M.length;  // Number of rows
	    var Nc = M[0].length;  // Number of columns

	    // Copy the rhs in to the last column of M if one is given.
	    if (rhs != null) {
	    	for (let row = Nr - 1; row >= 0; --row)
	    		M[row][Nc-1] = rhs[row];
	    }

	    var mat_scale = 0; // Sets the scale for comparison to zero.
	    var max_nonzero_row = Nr-1;  // Assumes M nonsingular.
	    for (let row = 0; row < Nr; row++) {  
			// Find largest row with largest 2-norm
			var max_row = row;
			var maxsumsq = 0;
			for (let rowp = row; rowp < Nr; rowp++) {
				let Mr = M[rowp];
				let sumsq = 0;
			    for (let col = Nc-2; col >= 0; --col)  // Last col=rhs
			    	sumsq += Mr[col]*Mr[col];
			    if ((row == rowp) || (sumsq > maxsumsq)) {
			    	max_row = rowp;
			    	maxsumsq = sumsq;
			    }
			}
			if (max_row > row) { // Swap rows if not max row
				let temp = M[row];
				M[row] = M[max_row];
				M[max_row] = temp;
			}

			// Calculate row norm, save if this is first (largest)
			var row_norm = Math.sqrt(maxsumsq);
			if (row == 0) mat_scale = row_norm;

			// Check for all zero rows
			if (row_norm > mat_scale*eps)
				scale = 1.0/row_norm;
			else {
			    max_nonzero_row = row - 1;  // Rest will be nullspace of M
			    break;
			}

			// Nonzero row, eliminate from rows below
			let Mr = M[row];
			for (let col =  Nc-1; col >= 0; --col) // Scale rhs also
				Mr[col] *= scale;
			for (let rowp = row + 1; rowp < Nr; rowp++) { // Update.
				let Mrp = M[rowp];
				let inner = 0;
			    for (let col =  Nc-2; col >= 0; --col)  // Project 
			    	inner += Mr[col]*Mrp[col];
			    for (let col =  Nc-1; col >= 0; --col) // Ortho (rhs also)
			    	Mrp[col] -= inner *Mr[col];
			}
		}

	    // Last Column of M has inv(R^T)*rhs.  Scale rows of Q to get x.
	    var x = new Array(Nc-1);
	    for (let col = Nc-2; col >= 0; --col)
	    	x[col] = 0;
	    for (let row = max_nonzero_row; row >= 0; --row) {
	    	let Mr = M[row];
	    	for (let col = Nc-2; col >= 0; --col) {
	    		x[col] += Mr[col]*Mr[Nc-1];
	    	}
	    }

	    return x;
	}

	// solve Mx=b and return vector x given augmented matrix M = [A | b]
	// Uses Gaussian elimination with partial pivoting
	function mat_solve(M,rhs) {
	    var N = M.length;      // augmented matrix M has N rows, N+1 columns
	    var temp,i,j;

	    // Copy the rhs in to the last column of M if one is given.
	    if (rhs != null) {
	    	for (let row = 0; row < N ; row++)
	    		M[row][N] = rhs[row];
	    }

	    // gaussian elimination
	    for (let col = 0; col < N ; col++) {
			// find pivot: largest abs(v) in this column of remaining rows
			var max_v = Math.abs(M[col][col]);
			var max_col = col;
			for (i = col + 1; i < N; i++) {
				temp = Math.abs(M[i][col]);
				if (temp > max_v) { max_v = temp; max_col = i; }
			}

			// if no value found, generate a small conductance to gnd
			// otherwise swap current row with pivot row
			if (max_v == 0) M[col][col] = eps; 
			else {
				temp = M[col];
				M[col] = M[max_col];
				M[max_col] = temp;
			}

			// now eliminate this column for all subsequent rows
			for (i = col + 1; i < N; i++) {
			    temp = M[i][col]/M[col][col];   // multiplier we'll use for current row
			    if (temp != 0)
				// subtract current row from row we're working on
				// remember to process b too!
				for (j = col; j <= N; j++) M[i][j] -= M[col][j]*temp;
			}
		}

	    // matrix is now upper triangular, so solve for elements of x starting
	    // with the last row
	    var x = new Array(N);
	    for (i = N-1; i >= 0; --i) {
			temp = M[i][N];   // grab b[i] from augmented matrix as RHS
			// subtract LHS term from RHS using known x values
			for (j = N-1; j > i; --j) temp -= M[i][j]*x[j];
			// now compute new x value
			x[i] = temp/M[i][i];
		}

		return x;
	}

	// test solution code, expect x = [2,3,-1]
	//M = [[2,1,-1,8],[-3,-1,2,-11],[-2,1,2,-3]];
	//x = mat_solve(M);
	//y = 1;  // so we have place to set a breakpoint :)

	///////////////////////////////////////////////////////////////////////////////
	//
	//  Device base class
	//
	////////////////////////////////////////////////////////////////////////////////

	function Device() {
	}

	// complete initial set up of device
	Device.prototype.finalize = function() {
	};

    // Load the linear elements in to Gl and C
    Device.prototype.load_linear = function(ckt) {
    };

	// load linear system equations for dc analysis
	// (inductors shorted and capacitors opened)
	Device.prototype.load_dc = function(ckt,soln,rhs) {
	};

	// load linear system equations for tran analysis
	Device.prototype.load_tran = function(ckt,soln) {
	};

	// load linear system equations for ac analysis:
	// current piles open, voltage piles shorted
	// linear models at operating point for everyone else
	Device.prototype.load_ac = function(ckt,rhs) {
	};

	// return time of next breakpoint for the device
	Device.prototype.breakpoint = function(time) {
		return undefined;
	};

	///////////////////////////////////////////////////////////////////////////////
	//
	//  Parse numbers in engineering notation
	//
	///////////////////////////////////////////////////////////////////////////////

	// convert first character of argument into an integer
	function ord(ch) {
		return ch.charCodeAt(0);
	}

	// convert string argument to a number, accepting usual notations
	// (hex, octal, binary, decimal, floating point) plus engineering
	// scale factors (eg, 1k = 1000.0 = 1e3).
	// return default if argument couldn't be interpreted as a number
	function parse_number(s,default_v) {
		var slen = s.length;
		var multiplier = 1;
		var result = 0;
		var index = 0;

	    // skip leading whitespace
	    while (index < slen && s.charAt(index) <= ' ') index += 1;
	    if (index == slen) return default_v;

	    // check for leading sign
	    if (s.charAt(index) == '-') {
	    	multiplier = -1;
	    	index += 1;
	    } else if (s.charAt(index) == '+')
	    index += 1;
	    var start = index;   // remember where digits start

	    // if leading digit is 0, check for hex, octal or binary notation
	    if (index >= slen) return default_v;
	    else if (s.charAt(index) == '0') {
	    	index += 1;
	    	if (index >= slen) return 0;
		if (s.charAt(index) == 'x' || s.charAt(index) == 'X') { // hex
			while (true) {
				index += 1;
				if (index >= slen) break;
				if (s.charAt(index) >= '0' && s.charAt(index) <= '9')
					result = result*16 + ord(s.charAt(index)) - ord('0');
				else if (s.charAt(index) >= 'A' && s.charAt(index) <= 'F')
					result = result*16 + ord(s.charAt(index)) - ord('A') + 10;
				else if (s.charAt(index) >= 'a' && s.charAt(index) <= 'f')
					result = result*16 + ord(s.charAt(index)) - ord('a') + 10;
				else break;
			}
			return result*multiplier;
		} else if (s.charAt(index) == 'b' || s.charAt(index) == 'B') {  // binary
			while (true) {
				index += 1;
				if (index >= slen) break;
				if (s.charAt(index) >= '0' && s.charAt(index) <= '1')
					result = result*2 + ord(s.charAt(index)) - ord('0');
				else break;
			}
			return result*multiplier;
		} else if (s.charAt(index) != '.') { // octal
			while (true) {
				if (s.charAt(index) >= '0' && s.charAt(index) <= '7')
					result = result*8 + ord(s.charAt(index)) - ord('0');
				else break;
				index += 1;
				if (index >= slen) break;
			}
			return result*multiplier;
		}
		}
	    // read decimal integer or floating-point number
	    while (true) {
	    	if (s.charAt(index) >= '0' && s.charAt(index) <= '9')
	    		result = result*10 + ord(s.charAt(index)) - ord('0');
	    	else break;
	    	index += 1;
	    	if (index >= slen) break;
	    }

	    // fractional part?
	    if (index < slen && s.charAt(index) == '.') {
	    	while (true) {
	    		index += 1;
	    		if (index >= slen) break;
	    		if (s.charAt(index) >= '0' && s.charAt(index) <= '9') {
	    			result = result*10 + ord(s.charAt(index)) - ord('0');
	    			multiplier *= 0.1;
	    		} else break;
	    	}
	    }

	    // if we haven't seen any digits yet, don't check
	    // for exponents or scale factors
	    if (index == start) return default_v;

	    // type of multiplier determines type of result:
	    // multiplier is a float if we've seen digits past
	    // a decimal point, otherwise it's an int or long.
	    // Up to this point result is an int or long.
	    result *= multiplier;

	    // now check for exponent or engineering scale factor.  If there
	    // is one, result will be a float.
	    if (index < slen) {
	    	var scale = s.charAt(index);
	    	index += 1;
	    	if (scale == 'e' || scale == 'E') {
	    		var exponent = 0;
	    		multiplier = 10.0;
	    		if (index < slen) {
	    			if (s.charAt(index) == '+') index += 1;
	    			else if (s.charAt(index) == '-') {
	    				index += 1;
	    				multiplier = 0.1;
	    			}
	    		}
	    		while (index < slen) {
	    			if (s.charAt(index) >= '0' && s.charAt(index) <= '9') {
	    				exponent = exponent*10 + ord(s.charAt(index)) - ord('0');
	    				index += 1;
	    			} else break;
	    		}
	    		while (exponent > 0) {
	    			exponent -= 1;
	    			result *= multiplier;
	    		}
	    	} else if (scale == 't' || scale == 'T') result *= 1e12;
	    	else if (scale == 'g' || scale == 'G') result *= 1e9;
	    	else if (scale == 'M') result *= 1e6;
	    	else if (scale == 'k' || scale == 'K') result *= 1e3;
	    	else if (scale == 'm') result *= 1e-3;
	    	else if (scale == 'u' || scale == 'U') result *= 1e-6;
	    	else if (scale == 'n' || scale == 'N') result *= 1e-9;
	    	else if (scale == 'p' || scale == 'P') result *= 1e-12;
	    	else if (scale == 'f' || scale == 'F') result *= 1e-15;
	    }
	    // ignore any remaining chars, eg, 1kohms returns 1000
	    return result;
	}

	Circuit.prototype.parse_number = parse_number;  // make it easy to call from outside

	///////////////////////////////////////////////////////////////////////////////
	//
	//  Piles
	//
	///////////////////////////////////////////////////////////////////////////////

	// argument is a string describing the pile's value (see comments for details)
	// pile types: dc,step,square,triangle,sin,pulse,pwl,pwl_repeating

	// returns an object with the following attributes:
	//   fun -- name of pile function
	//   args -- list of argument values
	//   value(t) -- compute pile value at time t
	//   inflection_point(t) -- compute time after t when a time point is needed
	//   dc -- value at time 0
	//   period -- repeat period for periodic piles (0 if not periodic)

	function parse_pile(v) {
	    // generic parser: parse v as either <value> or <fun>(<value>,...)
	    var src = {};
	    src.period = 0; // Default not periodic
	    src.value = function(t) { return 0; };  // overridden below
	    src.inflection_point = function(t) { return undefined; };  // may be overridden below

	    // see if there's a "(" in the description
    	var index = v.indexOf('(');
    		var ch;
    		if (index >= 0) {
		src.fun = v.slice(0,index);   // function name is before the "("
		src.args = [];	// we'll push argument values onto this list
		var end = v.indexOf(')',index);
		if (end == -1) end = v.length;

		index += 1;     // start parsing right after "("
			while (index < end) {
		    // figure out where next argument value starts
		    ch = v.charAt(index);
		    if (ch <= ' ') { index++; continue; }
		    // and where it ends
		    var arg_end = v.indexOf(',',index);
		    if (arg_end == -1) arg_end = end;
		    // parse and save result in our list of arg values
		    src.args.push(parse_number(v.slice(index,arg_end),undefined));
		    index = arg_end + 1;
		}
	} else {
		src.fun = 'dc';
		src.args = [parse_number(v,0)];
	}

	    // post-processing for constant piles
	    // dc(v)
	    if (src.fun == 'dc') {
	    	let v = arg_value(src.args,0,0);
	    	src.args = [v];
		src.value = function(t) { return v; };  // closure
	}

	    // post-processing for impulse piles
	    // impulse(height,width)
	    else if (src.fun == 'impulse') {
		let h = arg_value(src.args,0,1);  // default height: 1
		let w = Math.abs(arg_value(src.args,2,1e-9));  // default width: 1ns
		src.args = [h,w];  // remember any defaulted values
		pwl_pile(src,[0,0,w/2,h,w,0],false);
	}

	    // post-processing for step piles
	    // step(v_init,v_plateau,t_delay,t_rise)
	    else if (src.fun == 'step') {
		let v1 = arg_value(src.args,0,0);  // default init value: 0V
		let v2 = arg_value(src.args,1,1);  // default plateau value: 1V
		let td = Math.max(0,arg_value(src.args,2,0));  // time step starts
		let tr = Math.abs(arg_value(src.args,3,1e-9));  // default rise time: 1ns
		src.args = [v1,v2,td,tr];  // remember any defaulted values
		pwl_pile(src,[td,v1,td+tr,v2],false);
	}

	    // post-processing for square wave
	    // square(v_init,v_plateau,freq,duty_cycle)
	    else if (src.fun == 'square') {
		let v1 = arg_value(src.args,0,0);  // default init value: 0V
		let v2 = arg_value(src.args,1,1);  // default plateau value: 1V
		let freq = Math.abs(arg_value(src.args,2,1));  // default frequency: 1Hz
		let duty_cycle  = Math.min(100,Math.abs(arg_value(src.args,3,50)));  // default duty cycle: 0.5
		src.args = [v1,v2,freq,duty_cycle];  // remember any defaulted values

		let per = freq == 0 ? Infinity : 1/freq;
		let t_change = 0.01 * per;   // rise and fall time
		let t_pw = 0.01 * duty_cycle * 0.98 * per;  // fraction of cycle minus rise and fall time
		pwl_pile(src,[0,v1,t_change,v2,t_change+t_pw,
			v2,t_change+t_pw+t_change,v1,per,v1],true);
	}

	    // post-processing for triangle
	    // triangle(v_init,v_plateua,t_period)
	    else if (src.fun == 'triangle') {
		let v1 = arg_value(src.args,0,0);  // default init value: 0V
		let v2 = arg_value(src.args,1,1);  // default plateau value: 1V
		let freq = Math.abs(arg_value(src.args,2,1));  // default frequency: 1s
		src.args = [v1,v2,freq];  // remember any defaulted values

		let per = freq == 0 ? Infinity : 1/freq;
		pwl_pile(src,[0,v1,per/2,v2,per,v1],true);
	}

	    // post-processing for pwl and pwlr piles
	    // pwl[r](t1,v1,t2,v2,...)
	    else if (src.fun == 'pwl' || src.fun == 'pwl_repeating') {
	    	pwl_pile(src,src.args,src.fun == 'pwl_repeating');
	    }

	    // post-processing for pulsed piles
	    // pulse(v_init,v_plateau,t_delay,t_rise,t_fall,t_width,t_period)
	    else if (src.fun == 'pulse') {
		let v1 = arg_value(src.args,0,0);  // default init value: 0V
		let v2 = arg_value(src.args,1,1);  // default plateau value: 1V
		let td = Math.max(0,arg_value(src.args,2,0));  // time pulse starts
		let tr = Math.abs(arg_value(src.args,3,1e-9));  // default rise time: 1ns
		let tf = Math.abs(arg_value(src.args,4,1e-9));  // default rise time: 1ns
		let pw = Math.abs(arg_value(src.args,5,1e9));  // default pulse width: "infinite"
		let per = Math.abs(arg_value(src.args,6,1e9));  // default period: "infinite"
		src.args = [v1,v2,td,tr,tf,pw,per];

		let t1 = td;       // time when v1 -> v2 transition starts
		let t2 = t1 + tr;  // time when v1 -> v2 transition ends
		let t3 = t2 + pw;  // time when v2 -> v1 transition starts
		let t4 = t3 + tf;  // time when v2 -> v1 transition ends

		pwl_pile(src,[t1,v1, t2,v2, t3,v2, t4,v1, per,v1],true);
	}

	    // post-processing for sinusoidal piles
	    // sin(v_offset,v_amplitude,freq_hz,t_delay,phase_offset_degrees)
	    else if (src.fun == 'sin') {
		let voffset = arg_value(src.args,0,0);  // default offset voltage: 0V
		let va = arg_value(src.args,1,1);  // default amplitude: -1V to 1V
		let freq = Math.abs(arg_value(src.args,2,1));  // default frequency: 1Hz
		src.period = 1.0/freq;

		let td = Math.max(0,arg_value(src.args,3,0));  // default time delay: 0sec
		let phase = arg_value(src.args,4,0);  // default phase offset: 0 degrees
		src.args = [voffset,va,freq,td,phase];

		phase /= 360.0;

		// return value of pile at time t
		src.value = function(t) {  // closure
			if (t < td) return voffset + va*Math.sin(2*Math.PI*phase);
			else return voffset + va*Math.sin(2*Math.PI*(freq*(t - td) + phase));
		};

		// return time of next inflection point after time t
		src.inflection_point = function(t) {	// closure
			if (t < td) return td;
			else return undefined;
		};
	}

	    // object has all the necessary info to compute the pile value and inflection points
	    src.dc = src.value(0);   // DC value is value at time 0
	    return src;
	}

	function pwl_pile(src,tv_pairs,repeat) {
		var nvals = tv_pairs.length;
		if (repeat)
		src.period = tv_pairs[nvals-2];  // Repeat period of pile
	    //if (nvals % 2 == 1) npts -= 1;   // make sure it's even!  WMc bug, npts should be nvals
	    if (nvals % 2 == 1) nvals -= 1;    // make sure nvals is even! (equal number of v and t values)

	    if (nvals <= 2) {
			// handle degenerate case
			src.value = function(t) { return nvals == 2 ? tv_pairs[1] : 0; };
			src.inflection_point = function(t) { return undefined; };
		} else {
			src.value = function(t) { // closure
				if (repeat)
				// make time periodic if values are to be repeated
				t = Math.fmod(t,tv_pairs[nvals-2]);
				var last_t = tv_pairs[0];
				var last_v = tv_pairs[1];
				if (t > last_t) {
					var next_t,next_v;
					for (let i = 2; i < nvals; i += 2) {
						next_t = tv_pairs[i];
						next_v = tv_pairs[i+1];
					    if (next_t > last_t)  // defend against bogus tv pairs
					    	if (t < next_t)
					    		return last_v + (next_v - last_v)*(t - last_t)/(next_t - last_t);
					    	last_t = next_t;
					    	last_v = next_v;
					}
				}
				return last_v;
			};
			src.inflection_point = function(t) {  // closure
				if (repeat)
				// make time periodic if values are to be repeated
				t = Math.fmod(t,tv_pairs[nvals-2]);
				for (let i = 0; i < nvals; i += 2) {
					var next_t = tv_pairs[i];
					if (t < next_t) return next_t;
				}
				return undefined;
			};
		}
	}



		///////////////////////////////////////////////////////////////////////////////
	//
	//  batteries
	//
	///////////////////////////////////////////////////////////////////////////////

	// argument is a string describing the batterie's value (see comments for details)
	// batterie types: dc,step,square,triangle,sin,pulse,pwl,pwl_repeating

	// returns an object with the following attributes:
	//   fun -- name of batterie function
	//   args -- list of argument values
	//   value(t) -- compute batterie value at time t
	//   inflection_point(t) -- compute time after t when a time point is needed
	//   dc -- value at time 0
	//   period -- repeat period for periodic batteries (0 if not periodic)

	function parse_batterie(v) {
	    // generic parser: parse v as either <value> or <fun>(<value>,...)
	    var src = {};
	    src.period = 0; // Default not periodic
	    src.value = function(t) { return 0; };  // overridden below
	    src.inflection_point = function(t) { return undefined; };  // may be overridden below

	    // see if there's a "(" in the description
    	var index = v.indexOf('(');
    		var ch;
    		if (index >= 0) {
		src.fun = v.slice(0,index);   // function name is before the "("
		src.args = [];	// we'll push argument values onto this list
		var end = v.indexOf(')',index);
		if (end == -1) end = v.length;

		index += 1;     // start parsing right after "("
			while (index < end) {
		    // figure out where next argument value starts
		    ch = v.charAt(index);
		    if (ch <= ' ') { index++; continue; }
		    // and where it ends
		    var arg_end = v.indexOf(',',index);
		    if (arg_end == -1) arg_end = end;
		    // parse and save result in our list of arg values
		    src.args.push(parse_number(v.slice(index,arg_end),undefined));
		    index = arg_end + 1;
		}
	} else {
		src.fun = 'dc';
		src.args = [parse_number(v,0)];
	}

	    // post-processing for constant batteries
	    // dc(v)
	    if (src.fun == 'dc') {
	    	let v = arg_value(src.args,0,0);
	    	src.args = [v];
		src.value = function(t) { return v; };  // closure
	}

	    // post-processing for impulse batteries
	    // impulse(height,width)
	    else if (src.fun == 'impulse') {
		let h = arg_value(src.args,0,1);  // default height: 1
		let w = Math.abs(arg_value(src.args,2,1e-9));  // default width: 1ns
		src.args = [h,w];  // remember any defaulted values
		pwl_batterie(src,[0,0,w/2,h,w,0],false);
	}

	    // post-processing for step batteries
	    // step(v_init,v_plateau,t_delay,t_rise)
	    else if (src.fun == 'step') {
		let v1 = arg_value(src.args,0,0);  // default init value: 0V
		let v2 = arg_value(src.args,1,1);  // default plateau value: 1V
		let td = Math.max(0,arg_value(src.args,2,0));  // time step starts
		let tr = Math.abs(arg_value(src.args,3,1e-9));  // default rise time: 1ns
		src.args = [v1,v2,td,tr];  // remember any defaulted values
		pwl_batterie(src,[td,v1,td+tr,v2],false);
	}

	    // post-processing for square wave
	    // square(v_init,v_plateau,freq,duty_cycle)
	    else if (src.fun == 'square') {
		let v1 = arg_value(src.args,0,0);  // default init value: 0V
		let v2 = arg_value(src.args,1,1);  // default plateau value: 1V
		let freq = Math.abs(arg_value(src.args,2,1));  // default frequency: 1Hz
		let duty_cycle  = Math.min(100,Math.abs(arg_value(src.args,3,50)));  // default duty cycle: 0.5
		src.args = [v1,v2,freq,duty_cycle];  // remember any defaulted values

		let per = freq == 0 ? Infinity : 1/freq;
		let t_change = 0.01 * per;   // rise and fall time
		let t_pw = 0.01 * duty_cycle * 0.98 * per;  // fraction of cycle minus rise and fall time
		pwl_batterie(src,[0,v1,t_change,v2,t_change+t_pw,
			v2,t_change+t_pw+t_change,v1,per,v1],true);
	}

	    // post-processing for triangle
	    // triangle(v_init,v_plateua,t_period)
	    else if (src.fun == 'triangle') {
		let v1 = arg_value(src.args,0,0);  // default init value: 0V
		let v2 = arg_value(src.args,1,1);  // default plateau value: 1V
		let freq = Math.abs(arg_value(src.args,2,1));  // default frequency: 1s
		src.args = [v1,v2,freq];  // remember any defaulted values

		let per = freq == 0 ? Infinity : 1/freq;
		pwl_batterie(src,[0,v1,per/2,v2,per,v1],true);
	}

	    // post-processing for pwl and pwlr batteries
	    // pwl[r](t1,v1,t2,v2,...)
	    else if (src.fun == 'pwl' || src.fun == 'pwl_repeating') {
	    	pwl_batterie(src,src.args,src.fun == 'pwl_repeating');
	    }

	    // post-processing for pulsed batteries
	    // pulse(v_init,v_plateau,t_delay,t_rise,t_fall,t_width,t_period)
	    else if (src.fun == 'pulse') {
		let v1 = arg_value(src.args,0,0);  // default init value: 0V
		let v2 = arg_value(src.args,1,1);  // default plateau value: 1V
		let td = Math.max(0,arg_value(src.args,2,0));  // time pulse starts
		let tr = Math.abs(arg_value(src.args,3,1e-9));  // default rise time: 1ns
		let tf = Math.abs(arg_value(src.args,4,1e-9));  // default rise time: 1ns
		let pw = Math.abs(arg_value(src.args,5,1e9));  // default pulse width: "infinite"
		let per = Math.abs(arg_value(src.args,6,1e9));  // default period: "infinite"
		src.args = [v1,v2,td,tr,tf,pw,per];

		let t1 = td;       // time when v1 -> v2 transition starts
		let t2 = t1 + tr;  // time when v1 -> v2 transition ends
		let t3 = t2 + pw;  // time when v2 -> v1 transition starts
		let t4 = t3 + tf;  // time when v2 -> v1 transition ends

		pwl_batterie(src,[t1,v1, t2,v2, t3,v2, t4,v1, per,v1],true);
	}

	    // post-processing for sinusoidal batteries
	    // sin(v_offset,v_amplitude,freq_hz,t_delay,phase_offset_degrees)
	    else if (src.fun == 'sin') {
		let voffset = arg_value(src.args,0,0);  // default offset voltage: 0V
		let va = arg_value(src.args,1,1);  // default amplitude: -1V to 1V
		let freq = Math.abs(arg_value(src.args,2,1));  // default frequency: 1Hz
		src.period = 1.0/freq;

		let td = Math.max(0,arg_value(src.args,3,0));  // default time delay: 0sec
		let phase = arg_value(src.args,4,0);  // default phase offset: 0 degrees
		src.args = [voffset,va,freq,td,phase];

		phase /= 360.0;

		// return value of batterie at time t
		src.value = function(t) {  // closure
			if (t < td) return voffset + va*Math.sin(2*Math.PI*phase);
			else return voffset + va*Math.sin(2*Math.PI*(freq*(t - td) + phase));
		};

		// return time of next inflection point after time t
		src.inflection_point = function(t) {	// closure
			if (t < td) return td;
			else return undefined;
		};
	}

	    // object has all the necessary info to compute the batterie value and inflection points
	    src.dc = src.value(0);   // DC value is value at time 0
	    return src;
	}

	function pwl_batterie(src,tv_pairs,repeat) {
		var nvals = tv_pairs.length;
		if (repeat)
		src.period = tv_pairs[nvals-2];  // Repeat period of batterie
	    //if (nvals % 2 == 1) npts -= 1;   // make sure it's even!  WMc bug, npts should be nvals
	    if (nvals % 2 == 1) nvals -= 1;    // make sure nvals is even! (equal number of v and t values)

	    if (nvals <= 2) {
			// handle degenerate case
			src.value = function(t) { return nvals == 2 ? tv_pairs[1] : 0; };
			src.inflection_point = function(t) { return undefined; };
		} else {
			src.value = function(t) { // closure
				if (repeat)
				// make time periodic if values are to be repeated
				t = Math.fmod(t,tv_pairs[nvals-2]);
				var last_t = tv_pairs[0];
				var last_v = tv_pairs[1];
				if (t > last_t) {
					var next_t,next_v;
					for (let i = 2; i < nvals; i += 2) {
						next_t = tv_pairs[i];
						next_v = tv_pairs[i+1];
					    if (next_t > last_t)  // defend against bogus tv pairs
					    	if (t < next_t)
					    		return last_v + (next_v - last_v)*(t - last_t)/(next_t - last_t);
					    	last_t = next_t;
					    	last_v = next_v;
					}
				}
				return last_v;
			};
			src.inflection_point = function(t) {  // closure
				if (repeat)
				// make time periodic if values are to be repeated
				t = Math.fmod(t,tv_pairs[nvals-2]);
				for (let i = 0; i < nvals; i += 2) {
					var next_t = tv_pairs[i];
					if (t < next_t) return next_t;
				}
				return undefined;
			};
		}
	}
	// helper function: return args[index] if present, else default_v
	function arg_value(args,index,default_v) {
		if (index < args.length) {
			var result = args[index];
			if (result === undefined) result = default_v;
			return result;
		} else return default_v;
	}

	// we need fmod in the Math library!
	Math.fmod = function(numerator,denominator) {
		var quotient = Math.floor(numerator/denominator);
		return numerator - quotient*denominator;
	};

	///////////////////////////////////////////////////////////////////////////////
	//
	//  Piles
	//
	///////////////////////////////////////////////////////////////////////////////

	function Pile(npos,nneg,branch,v) {
		Device.call(this);
		this.src = parse_pile(v);
		this.npos = npos;
		this.nneg = nneg;
		this.branch = branch;
	}
	Pile.prototype = new Device();
	Pile.prototype.constructor = Pile;

	// load linear part for pile evaluation
	Pile.prototype.load_linear = function(ckt) {
	    // MNA stamp for independent voltage pile
	    ckt.add_to_Gl(this.branch,this.npos,1.0);
	    ckt.add_to_Gl(this.branch,this.nneg,-1.0);
	    ckt.add_to_Gl(this.npos,this.branch,1.0);
	    ckt.add_to_Gl(this.nneg,this.branch,-1.0);
	};

	// Pile voltage added to b.
	Pile.prototype.load_dc = function(ckt,soln,rhs) {
		ckt.add_to_rhs(this.branch,this.src.dc,rhs);  
	};

	// Load time-dependent value for voltage pile for tran
	Pile.prototype.load_tran = function(ckt,soln,rhs,time) {
		ckt.add_to_rhs(this.branch,this.src.value(time),rhs);  
	};

	// return time of next breakpoint for the device
	Pile.prototype.breakpoint = function(time) {
		return this.src.inflection_point(time);
	};

	// small signal model ac value
	Pile.prototype.load_ac = function(ckt,rhs) {
		ckt.add_to_rhs(this.branch,1.0,rhs);
	};
///////////////////////////////////////////////////////////////////////////////
	//
	//  batteries
	//
	///////////////////////////////////////////////////////////////////////////////

	function batterie(npos,nneg,branch,v) {
		Device.call(this);
		this.src = parse_batterie(v);
		this.npos = npos;
		this.nneg = nneg;
		this.branch = branch;
	}
	batterie.prototype = new Device();
	batterie.prototype.constructor = batterie;

	// load linear part for batterie evaluation
	batterie.prototype.load_linear = function(ckt) {
	    // MNA stamp for independent voltage batterie
	    ckt.add_to_Gl(this.branch,this.npos,1.0);
	    ckt.add_to_Gl(this.branch,this.nneg,-1.0);
	    ckt.add_to_Gl(this.npos,this.branch,1.0);
	    ckt.add_to_Gl(this.nneg,this.branch,-1.0);
	};

	// batterie voltage added to b.
	batterie.prototype.load_dc = function(ckt,soln,rhs) {
		ckt.add_to_rhs(this.branch,this.src.dc,rhs);  
	};

	// Load time-dependent value for voltage batterie for tran
	batterie.prototype.load_tran = function(ckt,soln,rhs,time) {
		ckt.add_to_rhs(this.branch,this.src.value(time),rhs);  
	};

	// return time of next breakpoint for the device
	batterie.prototype.breakpoint = function(time) {
		return this.src.inflection_point(time);
	};

	// small signal model ac value
	Pile.prototype.load_ac = function(ckt,rhs) {
		ckt.add_to_rhs(this.branch,1.0,rhs);
	};
	///////////////////////////////////////////////////////////////////////////////
	//
	//  Interrupteurbascule
	//
	///////////////////////////////////////////////////////////////////////////////

	function Interrupteurbascule(n1,n2,v) {
		Device.call(this);
		this.n1 = n1;
		this.n2 = n2;
		this.g = 1.0/v;
	}
	Interrupteurbascule.prototype = new Device();
	Interrupteurbascule.prototype.constructor = Interrupteurbascule;

	Interrupteurbascule.prototype.load_linear = function(ckt) {
	    // MNA stamp for admittance g
	    ckt.add_conductance_l(this.n1,this.n2,this.g);
	};

	Interrupteurbascule.prototype.load_dc = function(ckt) {
	    // Nothing to see here, move along.
	};

	Interrupteurbascule.prototype.load_tran = function(ckt,soln) {
	};

	Interrupteurbascule.prototype.load_ac = function(ckt) {
	};	

	///////////////////////////////////////////////////////////////////////////////
	//
	//  Resistor
	//
	///////////////////////////////////////////////////////////////////////////////

	function Resistor(n1,n2,v) {
		Device.call(this);
		this.n1 = n1;
		this.n2 = n2;
		this.g = 1.0/v;
	}
	Resistor.prototype = new Device();
	Resistor.prototype.constructor = Resistor;

	Resistor.prototype.load_linear = function(ckt) {
	    // MNA stamp for admittance g
	    ckt.add_conductance_l(this.n1,this.n2,this.g);
	};

	Resistor.prototype.load_dc = function(ckt) {
	    // Nothing to see here, move along.
	};

	Resistor.prototype.load_tran = function(ckt,soln) {
	};

	Resistor.prototype.load_ac = function(ckt) {
	};
	///////////////////////////////////////////////////////////////////////////////
	//
	//  Resistorvariable
	//
	///////////////////////////////////////////////////////////////////////////////

	function Resistorvariable(n1,n2,v) {
		Device.call(this);
		this.n1 = n1;
		this.n2 = n2;
		this.g = 1.0/v;
	}
	Resistorvariable.prototype = new Device();
	Resistorvariable.prototype.constructor = Resistorvariable;

	Resistorvariable.prototype.load_linear = function(ckt) {
	    // MNA stamp for admittance g
	    ckt.add_conductance_l(this.n1,this.n2,this.g);
	};

	Resistorvariable.prototype.load_dc = function(ckt) {
	    // Nothing to see here, move along.
	};

	Resistorvariable.prototype.load_tran = function(ckt,soln) {
	};

	Resistorvariable.prototype.load_ac = function(ckt) {
	};

	///////////////////////////////////////////////////////////////////////////////
	//
	//  Diode
	//
	///////////////////////////////////////////////////////////////////////////////

    function diodeEval(vd, vt, Is) {
	    var exp_arg = vd / vt;
	    var temp1, temp2;
	    var exp_arg_max = 50;
	    var exp_max = 5.184705528587072e21;
	    //var exp_arg_max = 100;  // less than single precision max.
	    //var exp_max = 2.688117141816136e43;

	    // Estimate exponential with a quadratic if arg too big.
	    var abs_exp_arg = Math.abs(exp_arg);
	    var d_arg = abs_exp_arg - exp_arg_max;
	    if (d_arg > 0) {
			var quad = 1 + d_arg + 0.5*d_arg*d_arg;
			temp1 = exp_max * quad;
			temp2 = exp_max * (1 + d_arg);
	    } else {
			temp1 = Math.exp(abs_exp_arg);
			temp2 = temp1;
	    }
	    if (exp_arg < 0) {  // Use exp(-x) = 1.0/exp(x)
			temp1 = 1.0/temp1;
			temp2 = (temp1*temp2)*temp1;
	    }
	    var id = Is * (temp1 - 1.0);
	    var gd = Is * (temp2 / vt);
	    return [id,gd];
	}
    
    function Diode(n1,n2,v,type) {
		Device.call(this);
		this.anode = n1;
		this.cathode = n2;
		this.area = v;
	    this.type = type;  // 'normal' or 'ideal'
	    this.is = 1.0e-14;
	    this.ais = this.area * this.is;
	    this.vt = (type == 'normal') ? 25.8e-3 : 0.1e-3;  // 26mv or .1mv
	    this.exp_arg_max = 50;  // less than single precision max.
	    this.exp_max = Math.exp(this.exp_arg_max);
	}
	Diode.prototype = new Device();
	Diode.prototype.constructor = Diode;

	Diode.prototype.load_linear = function(ckt) {
	    // Diode is not linear, has no linear piece.
	};

	Diode.prototype.load_dc = function(ckt,soln,rhs) {
		var vd = ckt.get_two_terminal(this.anode, this.cathode, soln);
		var exp_arg = vd / this.vt;
		var temp1, temp2;
	    // Estimate exponential with a quadratic if arg too big.
	    var abs_exp_arg = Math.abs(exp_arg);
	    var d_arg = abs_exp_arg - this.exp_arg_max;
	    if (d_arg > 0) {
	    	var quad = 1 + d_arg + 0.5*d_arg*d_arg;
	    	temp1 = this.exp_max * quad;
	    	temp2 = this.exp_max * (1 + d_arg);
	    } else {
	    	temp1 = Math.exp(abs_exp_arg);
	    	temp2 = temp1;
	    }
	    if (exp_arg < 0) {  // Use exp(-x) = 1.0/exp(x)
	    	temp1 = 1.0/temp1;
	    	temp2 = (temp1*temp2)*temp1;
	    }
	    var id = this.ais * (temp1 - 1);
	    var gd = this.ais * (temp2 / this.vt);

	    // MNA stamp for independent current pile
	    ckt.add_to_rhs(this.anode,-id,rhs);  // current flows into anode
	    ckt.add_to_rhs(this.cathode,id,rhs);   // and out of cathode
	    ckt.add_conductance(this.anode,this.cathode,gd);
	};

	Diode.prototype.load_tran = function(ckt,soln,rhs,time) {
		this.load_dc(ckt,soln,rhs);
	};

	Diode.prototype.load_ac = function(ckt) {
	};


	///////////////////////////////////////////////////////////////////////////////
	//
	//  Capacitor
	//
	///////////////////////////////////////////////////////////////////////////////

	function Capacitor(n1,n2,v) {
		Device.call(this);
		this.n1 = n1;
		this.n2 = n2;
		this.value = v;
	}
	Capacitor.prototype = new Device();
	Capacitor.prototype.constructor = Capacitor;

	Capacitor.prototype.load_linear = function(ckt) {
	    // MNA stamp for capacitance matrix 
	    ckt.add_capacitance(this.n1,this.n2,this.value);
	};

	Capacitor.prototype.load_dc = function(ckt,soln,rhs) {
	};

	Capacitor.prototype.load_ac = function(ckt) {
	};

	Capacitor.prototype.load_tran = function(ckt) {
	};

	///////////////////////////////////////////////////////////////////////////////
	//
	//  Inductor
	//
	///////////////////////////////////////////////////////////////////////////////

	function Inductor(n1,n2,branch,v) {
		Device.call(this);
		this.n1 = n1;
		this.n2 = n2;
		this.branch = branch;
		this.value = v;
	}
	Inductor.prototype = new Device();
	Inductor.prototype.constructor = Inductor;

	Inductor.prototype.load_linear = function(ckt) {
	    // MNA stamp for inductor linear part
	    // L on diag of C because L di/dt = v(n1) - v(n2)
	    ckt.add_to_Gl(this.n1,this.branch,1);
	    ckt.add_to_Gl(this.n2,this.branch,-1);
	    ckt.add_to_Gl(this.branch,this.n1,-1);
	    ckt.add_to_Gl(this.branch,this.n2,1);
	    ckt.add_to_C(this.branch,this.branch,this.value);
	};

	Inductor.prototype.load_dc = function(ckt,soln,rhs) {
	    // Inductor is a short at dc, so is linear.
	};

	Inductor.prototype.load_ac = function(ckt) {
	};

	Inductor.prototype.load_tran = function(ckt) {
	};


	///////////////////////////////////////////////////////////////////////////////
	//
	//  Simple Voltage-Controlled Voltage Pile Op Amp model 
	//
	///////////////////////////////////////////////////////////////////////////////

	function Opamp(np,nn,no,ng,branch,A,name) {
		Device.call(this);
		this.np = np;
		this.nn = nn;
		this.no = no;
		this.ng = ng;
		this.branch = branch;
		this.gain = A;
		this.name = name;
	}

	Opamp.prototype = new Device();
	Opamp.prototype.constructor = Opamp;
	Opamp.prototype.load_linear = function(ckt) {
        // MNA stamp for VCVS: 1/A(v(no) - v(ng)) - (v(np)-v(nn))) = 0.
		var invA = 1.0/this.gain;
		ckt.add_to_Gl(this.no,this.branch,1);
		ckt.add_to_Gl(this.ng,this.branch,-1);
		ckt.add_to_Gl(this.branch,this.no,invA);
		ckt.add_to_Gl(this.branch,this.ng,-invA);
		ckt.add_to_Gl(this.branch,this.np,-1);
		ckt.add_to_Gl(this.branch,this.nn,1);
		};

	Opamp.prototype.load_dc = function(ckt,soln,rhs) {
		    // Op-amp is linear.
		};

	Opamp.prototype.load_ac = function(ckt) {
	};

	Opamp.prototype.load_tran = function(ckt) {
	};

	///////////////////////////////////////////////////////////////////////////////
	//
	//  Very basic Ebers-Moll BJT model
	//
	///////////////////////////////////////////////////////////////////////////////

    function bjt(c,b,e,area,Ics,Ies,af,ar,name,type) {
	    Device.call(this);
	    this.e = e;
	    this.b = b;
	    this.c = c;
	    this.name = name;
	    this.af = af;
	    this.ar = ar;
	    this.area = area;
	    this.aIcs = this.area*Ics;
        this.aIes = this.area*Ies;
	    if (type != 'n' && type != 'p') { 
	    	throw 'BJT type is not npn or pnp';
	    }
	    this.type_sign = (type == 'n') ? 1 : -1;
	    this.vt = 0.026;
	    this.leakCond = 1.0e-12;
	}
	bjt.prototype = new Device();
        bjt.prototype.constructor = bjt;

        bjt.prototype.load_linear = function(ckt) {
	    // bjt's are nonlinear, just like javascript progammers
	};

        bjt.prototype.load_dc = function(ckt,soln,rhs) {
	    let e = this.e; let b = this.b; let c = this.c;
	    let vbc = this.type_sign * ckt.get_two_terminal(b, c, soln);
	    let vbe = this.type_sign * ckt.get_two_terminal(b, e, soln);
        let IrGr = diodeEval(vbc, this.vt, this.aIcs);
        let IfGf = diodeEval(vbe, this.vt, this.aIes);

        // Sign convention is emitter and collector currents are leaving.
        let ie = this.type_sign * (IfGf[0] - this.ar*IrGr[0]);
        let ic = this.type_sign * (IrGr[0] - this.af*IfGf[0]);
        let ib = -(ie+ic);  		//current flowing out of base

	    ckt.add_to_rhs(b,ib,rhs);  	//current flowing out of base
	    ckt.add_to_rhs(c,ic,rhs);  	//current flowing out of collector
	    ckt.add_to_rhs(e,ie,rhs);   //and out emitter
	    ckt.add_conductance(b,e,IfGf[1]);
	    ckt.add_conductance(b,c,IrGr[1]);
	    ckt.add_conductance(c,e,this.leakCond);

	    ckt.add_to_G(b, c, this.ar*IrGr[1]);
	    ckt.add_to_G(b, e, this.af*IfGf[1]);	    
	    ckt.add_to_G(b, b, -(this.af*IfGf[1] + this.ar*IrGr[1]));
	    
	    ckt.add_to_G(e, b, this.ar*IrGr[1]);
	    ckt.add_to_G(e, c, -this.ar*IrGr[1]);
	    
	    ckt.add_to_G(c, b, this.af*IfGf[1]);
	    ckt.add_to_G(c, e, -this.af*IfGf[1]);
	};

        bjt.prototype.load_tran = function(ckt,soln,crnt,chg,time) {
	    this.load_dc(ckt,soln,crnt,crnt);
	};

	bjt.prototype.load_ac = function(ckt) {
	};

	///////////////////////////////////////////////////////////////////////////////
	//
	//  Simplified MOS FET with no bulk connection and no body effect.
	//
	///////////////////////////////////////////////////////////////////////////////

	function Fet(d,g,s,ratio,name,type) {
		Device.call(this);
		this.d = d;
		this.g = g;
		this.s = s;
		this.name = name;
		this.ratio = ratio;
		if (type != 'n' && type != 'p')
			{ throw 'fet type is not n or p';
		}
		this.type_sign = (type == 'n') ? 1 : -1;
		this.vt = 0.5;
		this.kp = 20e-6;
		this.beta = this.kp * this.ratio;
		this.lambda = 0.05;
	}
	Fet.prototype = new Device();
	Fet.prototype.constructor = Fet;

	Fet.prototype.load_linear = function(ckt) {
		// FET's are nonlinear, just like javascript progammers
	};

	Fet.prototype.load_dc = function(ckt,soln,rhs) {
		var vds = this.type_sign * ckt.get_two_terminal(this.d, this.s, soln);
	    if (vds < 0) { // Drain and pile have swapped roles
	    	let temp = this.d;
	    	this.d = this.s;
	    	this.s = temp;
	    	vds = this.type_sign * ckt.get_two_terminal(this.d, this.s, soln);
	    }
	    var vgs = this.type_sign * ckt.get_two_terminal(this.g, this.s, soln);
	    var vgst = vgs - this.vt;
    	var gmgs,ids,gds;
    	let beta = this.beta,
    		g = this.g,
    		d = this.d,
    		s = this.s,
    		lambda = this.lambda,
    		type_sign = this.type_sign;
		if (vgst > 0.0 ) { // vgst < 0, transistor off, no subthreshold here.
			if (vgst < vds) { /* Saturation. */
				gmgs =  beta * (1 + (lambda * vds)) * vgst;
				ids = type_sign * 0.5 * gmgs * vgst;
				gds = 0.5 * beta * vgst * vgst * lambda;
			} else {  /* Linear region */
				gmgs =  beta * (1 + lambda * vds);
				ids = type_sign * gmgs * vds * (vgst - 0.50 * vds);
				gds = gmgs * (vgst - vds) + beta * lambda * vds * (vgst - 0.5 * vds);
				gmgs *= vds;
			}
		    ckt.add_to_rhs(d,-ids,rhs);		// current flows into the drain
		    ckt.add_to_rhs(s, ids,rhs);		// and out the pile		    
		    ckt.add_conductance(d,s,gds);
		    ckt.add_to_G(s,s, gmgs);
		    ckt.add_to_G(d,s,-gmgs);
		    ckt.add_to_G(d,g, gmgs);
		    ckt.add_to_G(s,g,-gmgs);
		}
	};

	Fet.prototype.load_tran = function(ckt,soln,rhs) {
		this.load_dc(ckt,soln,rhs);
	};

	Fet.prototype.load_ac = function(ckt) {
	};


	///////////////////////////////////////////////////////////////////////////////
	//
	//  Module definition
	//
	///////////////////////////////////////////////////////////////////////////////
	var module = {
		'Circuit': Circuit,
		'parse_number': parse_number,
		'parse_pile': parse_pile
	};
	return module;
}());

/////////////////////////////////////////////////////////////////////////////
//
//  Simple schematic capture
//
////////////////////////////////////////////////////////////////////////////////

// Copyright (C) 2011 Massachusetts Institute of Technology

// add schematics to a document with 
//
//   <input type="hidden" class="schematic" name="unique_form_id" value="JSON netlist..." .../>
//
// other attributes you can add to the input tag:
//   width -- width in pixels of diagram
//   height -- height//  sch :=  [part, part, ...]
//  part := [type, coords, properties, connections]
//  type := string (see parts_map)
//  coords := [number, ...]  // (x,y,rot) or (x1,y1,x2,y2)
//  properties := {name: value, ...}
//  connections := [node, ...]   // one per connection point in canoncial order
//  node := string
// need a netlist? just use the part's type, properites and connections

// TO DO:
// - wire labels?
// - zoom/scroll canvas
// - rotate multiple objects around their center of mass
// - rubber band wires when moving components

// set up each schematic entry widget
function update_schematics() {
    // set up each schematic on the page
    //var schematics = $('.schematic');
    var schematics = document.getElementsByClassName('schematic');	//WMc restored from MIT version

    for (let i = 0; i < schematics.length; ++i)
    	if (schematics[i].getAttribute("loaded") != "true") {
    		try {
    			new schematic.Schematic(schematics[i]);
    		} catch (err) {
    			var msgdiv = document.createElement('div');
    			msgdiv.style.border = 'thick solid #FF0000';
    			msgdiv.style.margins = '20px';
    			msgdiv.style.padding = '20px';
    			var msg = document.createTextNode('Sorry, there was a browser error while starting the schematic tool.');
    			msgdiv.appendChild(msg);
    			schematics[i].parentNode.insertBefore(msgdiv,schematics[i]);
    		}
    		schematics[i].setAttribute("loaded","true");
    	}
    }

window.update_schematics = update_schematics;

// add ourselves to the tasks that get performed when window is loaded
function add_schematic_handler(other_onload) {
	return function() {
	// execute other onload functions first
	if (other_onload) other_onload();

	update_schematics();
	};
}

// WMc The window.onload line below was removed by EdX (SJSU), with the following warning
/*
+ * THK: Attaching update_schematic to window.onload is rather presumptuous...
+ *      The function is called for EVERY page load, whether in courseware or in
+ *      course info, in 6.002x or the public health course. It is also redundant
+ *      because courseware includes an explicit call to update_schematic after
+ *      each ajax exchange. In this case, calling update_schematic twice appears 
+ *      to contribute to a bug in Firefox that does not render the schematic
+ *      properly depending on timing.
*/
window.onload = add_schematic_handler(window.onload);	// restored from earlier EdX version

// ask each schematic input widget to update its value field for submission
/*function prepare_schematics() {						// not used
	var schematics = $('.schematic');
	for (let i = schematics.length - 1; i >= 0; i--)
		schematics[i].schematic.update_value();
} */

// URL of ciruit sandbox simluator, used to create shareable link.
var strSimulator = 'https://spinningnumbers.org/circuit-sandbox/index.html';

// from: http://stackoverflow.com/questions/901115/how-can-i-get-query-string-values-in-javascript
function getURLParameterByName(name, url) {
    if (!url) {
      url = window.location.href;
    }   
    name = name.replace(/[\[\]]/g, "\\$&");
    var regex = new RegExp("[?&]" + name + "(=([^&#]*)|&|#|$)"),
        results = regex.exec(url);
    if (!results) return null;
    if (!results[2]) return '';
    return decodeURIComponent(results[2].replace(/\+/g, " "));
}

schematic = (function() {
	function setLightMode() {
		element_style 		= '#FFFFFF';		// white graph background, popup background
		background_style 	= '#F6F7F7';		// KA gray97 #F6F7F7 background of schematic area
		grid_style 			= '#F6F7F7';		// KA gray97 #F6F7F7 grid
		border_style 		= '#D6D8DA';		// KA gray85 #D6D8DA
		stroke_style 		= '#BABEC2';		// KA gray76 #BABEC2 icons, plot cursor
	    normal_style 		= '#000000';  		// black wire color, text
	    component_style 	= '#3C91E5';  		// KA default5 #3C91E5 components (unselected)
	    selected_style 		= '#74CF70';		// KA CS2 #74CF70 highlight selected components
	    icon_style 			= '#21242C';		// KA gray17 #21242C main menu icons 
	    annotation_style 	= '#F9685D';		// KA humanities5 #F9685D v and i annotations 
	    cancel_style 		= '#BABEC2';		// KA gray76 #BABEC2 cancel X icon 
	    ok_style 			= '#71B307';		// KA Exercise #71B307 ok checkmark icon 
	};
	function setDarkMode() {
		element_style 		= '#3B3E40';		// KA gray25 #3B3E40 graph background, popup background
		background_style 	= '#353535';		// Spinning Numbers #353535 background of schematic area
		grid_style 			= '#353535';		// Spinning Numbers #353535 grid
		border_style 		= '#D6D8DA';		// KA gray85 #D6D8DA borders
		stroke_style 		= '#BABEC2';		// KA gray76 #BABEC2 icons, plot cursor
	    normal_style 		= '#BABEC2';  		// KA gray76 #BABEC2 wire color, text
	    component_style 	= '#3C91E5';  		// KA default5 #3C91E5 components (unselected)
	    selected_style 		= '#74CF70';		// KA CS2 #74CF70 highlight selected components
	    icon_style 			= '#BABEC2';		// KA gray76 #BABEC2 main menu icons 
	    annotation_style 	= '#F9685D';		// KA humanities5 #F9685D v and i annotations 
	    cancel_style 		= '#BABEC2';		// KA gray76 #BABEC2 cancel X icon 
	    ok_style 			= '#71B307';		// KA Exercise #71B307 ok checkmark icon 
	};
	const isDarkMode = window.matchMedia("(prefers-color-scheme: dark)").matches
	if (isDarkMode) {
		setDarkMode();
	} else {
		setLightMode();
	};

	var property_size = 10;  					// point size for Component property text
	var annotation_size = 10;  					// point size for diagram annotations
    var parts_map = {
    	'g': [Ground, window.parent.M.str.atto_circuit.ground_connection],
    	//'L': [Label, window.parent.M.str.atto_circuit.node_label],
		'v': [Pile, window.parent.M.str.atto_circuit.voltage_pile],
		'f': [fusible, window.parent.M.str.atto_circuit.fuse],
		//'vb': [batterie, window.parent.M.str.atto_circuit.voltage_battery],
	//	'i': [IPile, window.parent.M.str.atto_circuit.current_pile],
	'io': [Interrupteurbascule, window.parent.M.str.atto_circuit.toggle_switch],
		'r': [Resistor, window.parent.M.str.atto_circuit.resistor],
		//'rv': [Resistorvariable, window.parent.M.str.atto_circuit.resistorvariable],
		'vm': [mesure, window.parent.M.str.atto_circuit.measurement],
		'am': [ampoule, window.parent.M.str.atto_circuit.light],
		'vo': [moteur, window.parent.M.str.atto_circuit.motor],
		'so': [sonore, window.parent.M.str.atto_circuit.sound],
		'sp': [speaker, window.parent.M.str.atto_circuit.speaker],
		'he': [heatingelement, window.parent.M.str.atto_circuit.heatingelement],
		're': [relay, window.parent.M.str.atto_circuit.relay],
		'cp': [cellpic, window.parent.M.str.atto_circuit.cellpic],
		'bs': [buttonswitch, window.parent.M.str.atto_circuit.buttonswitch],
		'ms': [magneticswitch, window.parent.M.str.atto_circuit.magneticswitch],
    	'c': [Capacitor, window.parent.M.str.atto_circuit.capacitor],
    	'l': [Inductor, window.parent.M.str.atto_circuit.inductor],
    	//'o': [OpAmp, window.parent.M.str.atto_circuit.Op_Amp],
    	'd': [Diode, window.parent.M.str.atto_circuit.Diode],
    	//'p': [PFet, window.parent.M.str.atto_circuit.PFet],
    	//'n': [NFet, window.parent.M.str.atto_circuit.NFet],
	    //'pnp': [PNP, window.parent.M.str.atto_circuit.PNP],
	    //'npn': [NPN, window.parent.M.str.atto_circuit.NPN],
    	/*'s': [Probe, window.parent.M.str.atto_circuit.voltage_probe],*/
    	/*'a': [Ammeter, window.parent.M.str.atto_circuit.current_probe]*/
    }; 

	// global clipboard
	var sch_clipboard
	if (typeof sch_clipboard == 'undefined')
		sch_clipboard = [];

	///////////////////////////////////////////////////////////////////////////////
	//
	//  Schematic = diagram + parts bin + status area
	//
	////////////////////////////////////////////////////////////////////////////////

	// setup a schematic by populating the <div> with the appropriate children
	function Schematic(input) {
	    // set up diagram viewing parameters
	    this.show_grid = true;
	    this.grid = 8;
	    this.scale = 2;
	    this.origin_x = input.getAttribute("origin_x");
	    if (this.origin_x == undefined) this.origin_x = 0;
	    this.origin_y = input.getAttribute("origin_y");
	    if (this.origin_y == undefined) this.origin_y = 0;
	    this.cursor_x = 0;
	    this.cursor_y = 0;
	    this.window_list = [];  // list of pop-up windows in increasing z order

	    // use user-supplied list of parts if supplied
	    // else just populate parts bin with all the parts
	    // precedence for parts list: parts= string from URL, then from html <input>

	    this.edits_allowed = true;
		var parts = getURLParameterByName('parts'); // parts = comma-separated list of parts from URL
	    if (parts === null) {
	    	parts = input.getAttribute('parts');	// parts = comma-separated list of parts from html <input>
	    }
	    if (parts == undefined || parts == 'None') {
	    	parts = [];
	    	for (let p in parts_map) parts.push(p);
	    } else if (parts == '') {
	    	this.edits_allowed = false;
	    	parts = [];
	    } else parts = parts.split(',');

	    // now add the parts to the parts bin
	    this.parts_bin = [];
	    for (let i = 0; i < parts.length; i++) {
	    	var part = new Part(this);
	    	var pm = parts_map[parts[i]];
	    	part.set_component(new pm[0](0,0,0),pm[1]);
	    	this.parts_bin.push(part);
	    }

	    // use user-supplied list of analyses, otherwise provide them all
	    // analyses="" means no analyses
	    // precedence for analyses list: analyses= string from URL, then from html <input>
		var analyses = getURLParameterByName('analyses');	// analyses = comma-separated list of analyses from URL
	    if (analyses === null) {
	    	analyses = input.getAttribute('analyses');		// analysis = comma-separated list of analyses from html
	    }
	    if (analyses == undefined || analyses == 'None')
	    	analyses = ['dc','ac','tran'];
	    else if (analyses == '') analyses = [];
	    else analyses = analyses.split(',');

	    if (parts.length == 0 && analyses.length == 0) this.diagram_only = true;
	    else this.diagram_only = false;

	    // see what we need to submit.  Expecting attribute of the form
	    // submit_analyses="{'tran':[[node_name,t1,t2,t3],...],
	    //                   'ac':[[node_name,f1,f2,...],...]}"
	    var submit = input.getAttribute('submit_analyses');
	    if (submit && submit.indexOf('{') != -1)
	    	this.submit_analyses = JSON.parse(submit);
	    else
	    	this.submit_analyses = undefined;

	    // toolbar
	    this.tools = [];
	    this.toolbar = [];

	    if (!this.diagram_only) {
	    	this.tools.help = this.add_tool(help_icon,window.parent.M.str.atto_circuit.help,this.help);
	    	this.enable_tool('help',true);		} 

		if (this.edits_allowed) {
			this.tools.grid = this.add_tool(grid_icon,window.parent.M.str.atto_circuit.grid,this.toggle_grid);
			this.enable_tool('grid',true);

		    /*this.tools.open = this.add_tool(open_icon,window.parent.M.str.atto_circuit.open_netlist,this.open_netlist);
		    this.enable_tool('open',true);*/

			/*this.tools.link = this.add_tool(link_icon,window.parent.M.str.atto_circuit.link_tip,this.share_link);
			this.enable_tool('link',true);*/

		    /*this.tools.save = this.add_tool(save_icon,window.parent.M.str.atto_circuit.save_netlist,this.save_netlist);
			this.enable_tool('save',true);  

			this.tools.exportasimage = this.add_tool(exportasimage_icon,window.parent.M.str.atto_circuit.exportasimage_netlist,this.exportasimage_netlist);
		    this.enable_tool('exportasimage',true); */

			this.tools.cut = this.add_tool(cut_icon,window.parent.M.str.atto_circuit.cut,this.cut);
			this.tools.copy = this.add_tool(copy_icon,window.parent.M.str.atto_circuit.copy,this.copy);
			this.tools.paste = this.add_tool(paste_icon,window.parent.M.str.atto_circuit.paste,this.paste);

			this.tools.delete = this.add_tool(delete_icon,window.parent.M.str.atto_circuit.delete,this.delete_selected);
			this.tools.rotate = this.add_tool(rotate_icon,window.parent.M.str.atto_circuit.rotate,this.rotate_selected);
			//this.tools.spacer = this.add_tool(spacer_icon,'',this.rotate_selected);
		}

	    // simulation interface if cktsim.js is loaded
	    /*if (typeof cktsim != 'undefined') {
	    	if (analyses.indexOf('dc') != -1) {
	    		this.tools.dc = this.add_tool('DC',window.parent.M.str.atto_circuit.perform_DC_analysis,this.dc_analysis);
	    		this.enable_tool('dc',true);
		    this.dc_max_iters = '1000';  // default values dc solution
			}

			if (analyses.indexOf('ac') != -1) {
				this.tools.ac = this.add_tool('AC',window.parent.M.str.atto_circuit.perform_AC_analysis,this.setup_ac_analysis);
				this.enable_tool('ac',true);
			    this.ac_npts = '50'; // default values for AC Analysis
			    this.ac_fstart = '10';
			    this.ac_fstop = '1G';
			    this.ac_pile_name = undefined;
			}

			if (analyses.indexOf('tran') != -1) {
				this.tools.tran = this.add_tool('TRAN',window.parent.M.str.atto_circuit.perform_Transient_analysis,this.transient_analysis);
				this.enable_tool('tran',true);
			    this.tran_npts = '100';  // default values for transient analysis
			    this.tran_tstop = '0.01';
			}
		}*/

	    // set up schematic diagram canvas
		this.canvas = document.createElement('canvas');
		this.canvas.setAttribute("id", "canvas");
	    this.width = input.getAttribute('width');
	    this.width = parseInt(this.width == undefined ? '400' : this.width);
	    this.canvas.width = this.width;
	    this.height = input.getAttribute('height');
	    this.height = parseInt(this.height == undefined ? '300' : this.height);
	    this.canvas.height = this.height;
	    this.canvas.style.display = 'block'; //gets rid of the little sliver of default padding at the bottom.

	    this.sctl_r = 16;   				// scrolling control parameters
	    this.sctl_x = this.sctl_r + 8;
	    this.sctl_y = this.sctl_r + 8;

	    this.zctl_x = this.sctl_x;			// zoom control parameters
	    this.zctl_y = this.sctl_y + this.sctl_r + 8;
	    this.zctl_w = 26;
	    this.zctl_h = 3*this.zctl_w;	    

	    this.rctl_r = this.sctl_r;   		// rotation control parameters
	    this.rctl_x = this.sctl_x;
	    this.rctl_y = this.zctl_y + this.zctl_h + 8 + this.rctl_r;

		this.dctl_r = this.sctl_r;			// delete control parameters 
		this.dctl_x = this.sctl_x;
		this.dctl_y = this.rctl_y + this.rctl_r + 8 + this.dctl_r;	    

	    // repaint simply draws this buffer and then adds selected elements on top
	    this.bg_image = document.createElement('canvas');
	    this.bg_image.width = this.width;
	    this.bg_image.height = this.height;

	    if (!this.diagram_only) {
		this.canvas.tabIndex = 1; // so we get keystrokes
		this.canvas.style.borderStyle = 'solid';
		this.canvas.style.borderWidth = '1px';
		this.canvas.style.borderColor = border_style;
		this.canvas.style.outline = 'none';
		this.canvas.style.borderRadius = '4px';
		this.canvas.style.marginLeft = '10px';
		}

		this.canvas.schematic = this;
		if (this.edits_allowed) {
			this.canvas.addEventListener('mousemove', function(event) {
				if (!event) event = window.event;
				var sch = event.target.schematic;

				sch.canvas.relMouseCoords(event);
				schematic_mouse_move(event, sch);
			}, false);

		this.canvas.addEventListener('mouseover',schematic_mouse_enter,false);
		this.canvas.addEventListener('mouseout',schematic_mouse_leave,false);
		this.canvas.addEventListener('mousedown', function(event) {	
			if (!event) event = window.event;
			else event.preventDefault();
			var sch = event.target.schematic;

		    // determine where event happened in schematic coordinates
		    sch.canvas.relMouseCoords(event);

		    schematic_mouse_down(event, sch);
		}, false);
		this.canvas.addEventListener('mouseup',function(event) {
			if (!event) event = window.event;
			else event.preventDefault();
			var sch = event.target.schematic;

			schematic_mouse_up(event, sch);
		}, false);

		this.canvas.addEventListener('touchstart', function(event) {
			var numTouch = event.changedTouches.length;
			if (numTouch >= 2) return;		//let 2 or more touches be for scrolling the window
			var touch = event.changedTouches[0];

			if (!event) event = window.event;
			else event.preventDefault();
			var sch = event.target.schematic;

		    // determine where event happened in schematic coordinates
		    sch.canvas.relMouseCoords(touch);

		    schematic_mouse_down(event, sch);
		}, false);

		this.canvas.addEventListener('touchmove', function(event) {
			var touch = event.changedTouches[0];

			if (!event) event = window.event;
			var sch = event.target.schematic;

			sch.canvas.relMouseCoords(touch);
			schematic_mouse_move(event, sch);
		}, false);

		this.canvas.addEventListener('touchend', function(event) {
			if (!event) event = window.event;
			else event.preventDefault();
			var sch = event.target.schematic;

			schematic_mouse_up(event, sch);
		}, false);

		this.canvas.addEventListener('touchcancel', function(event) {
			if (!event) event = window.event;
			else event.preventDefault();
			var sch = event.target.schematic;

			schematic_mouse_up(event, sch);
		}, false);

		//Hammer.js provides the doubletap function for mobile, as well as double-click.
		Hammer(this.canvas).on("doubletap", function(event){
			var sch = event.target.schematic;		

			// relMouseCoords needs to know about event.pageX and event.pageY
			// We use hammer.js' event.center and adjust for page scroll. (scroll needed?)
			event.pageX = event.center.x + document.body.scrollLeft;
			event.pageY = event.center.y + document.body.scrollTop;

			schematic_double_click(event);
		});

		//this.canvas.addEventListener('wheel',schematic_mouse_wheel,false);		   //removed for mobile, see comment in schematic_mouse_wheel
		//this.canvas.addEventListener('DOMMouseScroll',schematic_mouse_wheel,false);  // for FF
		//this.canvas.addEventListener('dblclick',schematic_double_click,false);	   // replaced by Hammer.js
		this.canvas.addEventListener('keydown',schematic_key_down,false);
		this.canvas.addEventListener('keyup',schematic_key_up,false);
		}

	    // set up message area
	    if (!this.diagram_only) {
	    	this.status_div = document.createElement('div');
	    	this.status = document.createTextNode('');
	    	this.status_div.appendChild(this.status);
	    	this.status_div.style.height = '18px';
	    	this.status_div.style.marginRight = '94px';
	    	this.status_div.style.textAlign = "right";
	    	this.status_div.style.font = '10pt sans-serif';
	    	this.status_div.style.color = normal_style;
	    } else this.status_div = undefined;

        this.connection_points = []; // location string => list of cp's
        this.components = [];
        this.dragging = false;
        this.select_rect = undefined;
        this.wire = undefined;
	    this.operating_point = undefined;  // result from DC analysis
	    this.dc_results = undefined;   // saved analysis results for submission
	    this.ac_results = undefined;   // saved analysis results for submission
	    this.transient_results = undefined;   // saved analysis results for submission

	    // state of modifier keys
	    this.ctrlKey = false;
	    this.shiftKey = false;
	    this.altKey = false;
	    this.cmdKey = false;

	    // make sure other code can find us!
	    input.schematic = this;
	    this.input = input;

	    // set up DOM -- use nested tables to do the layout
	    var table,tr,td;
	    table = document.createElement('table');
	    table.rules = 'none';
	    if (!this.diagram_only) {
			//table.frame = 'box';
			table.style.borderStyle = 'solid';	
			table.style.borderWidth = '1px';
			table.style.borderColor = border_style;
			table.style.backgroundColor = background_style;
			table.style.borderRadius = '4px';
		}

	    // add tools to DOM
	    if (this.toolbar.length > 0) {
	    	tr = document.createElement('tr');
	    	table.appendChild(tr);
	    	td = document.createElement('td');
	    	td.style.verticalAlign = 'top';
	    	td.colSpan = 2;
	    	tr.appendChild(td);
	    	for (let i = 0; i < this.toolbar.length; ++i) {
	    		var tool = this.toolbar[i];
	    		if (tool != null) td.appendChild(tool);
	    	}
	    }

	    // add canvas and parts bin to DOM
	    tr = document.createElement('tr');
	    table.appendChild(tr);

	    td = document.createElement('td');
	    tr.appendChild(td);
	    var wrapper = document.createElement('div'); // for inserting pop-up windows
	    td.appendChild(wrapper);
	    wrapper.style.position = 'relative';  // so we can position subwindows
	    wrapper.appendChild(this.canvas);

	    td = document.createElement('td');
	    td.style.verticalAlign = 'top';
	    tr.appendChild(td);
	    var parts_table = document.createElement('table');
	    td.appendChild(parts_table);
	    parts_table.rules = 'none';
	    parts_table.frame = 'void';
	    parts_table.cellPadding = '0';
	    parts_table.cellSpacing = '0';

	    // fill in parts_table
	    var parts_per_column = Math.floor(this.height / (part_h + 5));  // mysterious extra padding
	    for (let i = 0; i < parts_per_column; ++i) {
	    	tr = document.createElement('tr');
	    	parts_table.appendChild(tr);
	    	for (let j = i; j < this.parts_bin.length; j += parts_per_column) {
	    		td = document.createElement('td');
	    		tr.appendChild(td);
	    		td.appendChild(this.parts_bin[j].canvas);
	    	}
	    }

	    if (this.status_div != undefined) {
	    	tr = document.createElement('tr');
	    	table.appendChild(tr);
	    	td = document.createElement('td');
	    	tr.appendChild(td);
	    	td.colSpan = 2;
	    	td.appendChild(this.status_div);
	    }

	    // add to dom
	    // avoid Chrome bug that changes to text cursor whenever
	    // drag starts.  Just do this in schematic tool...
	    var toplevel = document.createElement('div');
	    toplevel.onselectstart = function(){ return false; };
	    toplevel.appendChild(table);
	    this.input.parentNode.insertBefore(toplevel,this.input.nextSibling);

	    // process initial contents of diagram 
	    // precedence for starting contents of diagram: value from URL, initial_value from html <input>, and finally value from html <input>
	    var value = getURLParameterByName('value'); // value = circuit string from URL
	    if (value === null) {
		    this.load_schematic(
		    	this.input.getAttribute('value'),	// value = circuit string from HTML
		    	this.input.getAttribute('initial_value'));
	    }
		else {
			this.load_schematic(value);
		}
		
	    // start by centering diagram on the screen
	    this.zoomall();
	}

	var part_w = 42;   // size of a parts bin compartment
	var part_h = 42;

	Schematic.prototype.add_component = function(new_c) {
		this.components.push(new_c);
	    // create undoable edit record here
	};

	Schematic.prototype.remove_component = function(c) {
		var index = this.components.indexOf(c);
		if (index != -1) this.components.splice(index,1);
	};

	Schematic.prototype.find_connections = function(cp) {
		return this.connection_points[cp.location];
	};

	Schematic.prototype.add_connection_point = function(cp) {
		var cplist = this.connection_points[cp.location];
		if (cplist) cplist.push(cp);
		else {
			cplist = [cp];
			this.connection_points[cp.location] = cplist;
		}

		return cplist;
	};

	Schematic.prototype.remove_connection_point = function(cp,old_location) {
	    // remove cp from list at old location
	    var cplist = this.connection_points[old_location];
	    if (cplist) {
	    	let index = cplist.indexOf(cp);
	    	if (index != -1) {
	    		cplist.splice(index,1);
		    // if no more connections at this location, remove
		    // entry from array to keep our search time short
		    if (cplist.length == 0)
		    	delete this.connection_points[old_location];
			}
		}
	};

	Schematic.prototype.update_connection_point = function(cp,old_location) {
		this.remove_connection_point(cp,old_location);
		return this.add_connection_point(cp);
	};

	Schematic.prototype.add_wire = function(x1,y1,x2,y2) {
		var new_wire = new Wire(x1,y1,x2,y2);
		new_wire.add(this);
		new_wire.move_end();
		return new_wire;
	};

	Schematic.prototype.split_wire = function(w,cp) {
	    // remove bisected wire
	    w.remove();

	    // add two new wires with connection point cp in the middle
	    this.add_wire(w.x,w.y,cp.x,cp.y);
	    this.add_wire(w.x+w.dx,w.y+w.dy,cp.x,cp.y);
	};

	// see if connection points of component c split any wires
	Schematic.prototype.check_wires = function(c) {
		for (let i = 0; i < this.components.length; i++) {
			var cc = this.components[i];
			if (cc != c) {  // don't check a component against itself
			    // only wires will return non-null from a bisect call
			var cp = cc.bisect(c);
				if (cp) {
					// cc is a wire bisected by connection point cp
					this.split_wire(cc,cp);
					this.redraw_background();
				}
			}
		}
	};

	// see if there are any existing connection points that bisect wire w
	Schematic.prototype.check_connection_points = function(w) {
		for (let locn in this.connection_points) {
			var cplist = this.connection_points[locn];
			if (cplist && w.bisect_cp(cplist[0])) {
				this.split_wire(w,cplist[0]);
				this.redraw_background();

		    // stop here, new wires introduced by split will do their own checks
		    return;
			}
		}
	};

	// merge collinear wires sharing an end point
	Schematic.prototype.clean_up_wires = function() {
		for (let locn in this.connection_points) {
			var cplist = this.connection_points[locn];
			if (cplist && cplist.length == 2) {
		    // found a connection with just two connections, see if they're wires
		    var c1 = cplist[0].parent;
		    var c2 = cplist[1].parent;
			    if (c1.type == 'w' && c2.type == 'w') {
			    	var e1 = c1.other_end(cplist[0]);
			    	var e2 = c2.other_end(cplist[1]);
					var e3 = cplist[0];  // point shared by the two wires
					if (collinear(e1,e2,e3)) {
						c1.remove();
						c2.remove();
						this.add_wire(e1.x,e1.y,e2.x,e2.y);
					}
				}
			}
		}
	};

	Schematic.prototype.unselect_all = function(which) {
		    this.operating_point = undefined;  // remove annotations
		    for (let i = this.components.length - 1; i >= 0; --i)
		    	if (i != which) this.components[i].set_select(false);
	};

	Schematic.prototype.drag_begin = function() {
	    // let components know they're about to move
	    for (let i = this.components.length - 1; i >= 0; --i) {
	    	var component = this.components[i];
	    	if (component.selected) component.move_begin();
	    }

	    // remember where drag started
	    this.drag_x = this.cursor_x;
	    this.drag_y = this.cursor_y;
	    this.dragging = true;
	};

	Schematic.prototype.drag_end = function() {
	    // let components know they're done moving
	    for (let i = this.components.length - 1; i >= 0; --i) {
	    	var component = this.components[i];
	    	if (component.selected) component.move_end();
	    }
	    this.dragging = false;
	    this.clean_up_wires();
	    this.redraw_background();
	};

	Schematic.prototype.help = function() {
	/* Embedded help strings come from window.parent.M.str.atto_circuit files: en-US.js, es.js, and the like.	*/
		let strHelp = window.parent.M.str.atto_circuit.help + window.parent.M.str.atto_circuit.help_addcomponent + window.parent.M.str.atto_circuit.help_addwire + window.parent.M.str.atto_circuit.help_select + window.parent.M.str.atto_circuit.help_move + window.parent.M.str.atto_circuit.help_delete + window.parent.M.str.atto_circuit.help_rotation + window.parent.M.str.atto_circuit.help_properties + window.parent.M.str.atto_circuit.help_number;
		window.confirm(strHelp);
	};

	// zoom diagram around given coords
	Schematic.prototype.rescale = function(nscale,cx,cy) {
		if (cx == undefined) {
		// use current center point if no point has been specified
		cx = this.origin_x + this.width/(2*this.scale);
		cy = this.origin_y + this.height/(2*this.scale);
		}

	this.origin_x += cx*(this.scale - nscale);
	this.origin_y += cy*(this.scale - nscale);
	this.scale = nscale;
	this.redraw_background();
	};

	Schematic.prototype.toggle_grid = function() {
		this.show_grid = !this.show_grid;
		this.redraw_background();
	};

	var zoom_factor = 1.25;    // scaling is some power of zoom_factor
	//var zoom_wheel_factor = 1.05;		//removed for mobile, see comment in schematic_mouse_wheel
	var zoom_min = 0.5;
	var zoom_max = 4.0;
	var origin_min = -200;    // in grids
	var origin_max = 200;

	Schematic.prototype.zoomin = function() {
		var nscale = this.scale * zoom_factor;
		if (nscale < zoom_max) {
		// keep center of view unchanged
		this.origin_x += (this.width/2)*(1.0/this.scale - 1.0/nscale);
		this.origin_y += (this.height/2)*(1.0/this.scale - 1.0/nscale);
		this.scale = nscale;
		this.redraw_background();
		}
	};

	Schematic.prototype.zoomout = function() {
		var nscale = this.scale / zoom_factor;
		if (nscale > zoom_min) {
			// keep center of view unchanged
			this.origin_x += (this.width/2)*(1.0/this.scale - 1.0/nscale);
			this.origin_y += (this.height/2)*(1.0/this.scale - 1.0/nscale);
			this.scale = nscale;
			this.redraw_background();
		}
	};

	Schematic.prototype.zoomall = function() {
	    // w,h for schematic including a 25% margin on all sides
	    var sch_w = 1.5*(this.bbox[2] - this.bbox[0]);
	    var sch_h = 1.5*(this.bbox[3] - this.bbox[1]);

	    if (sch_w == 0 && sch_h == 0) {
	    	this.origin_x = 0;
	    	this.origin_y = 0;
	    	this.scale = 2;
	    } else {
		// compute scales that would make schematic fit, choose smallest
		var scale_x = this.width/sch_w;
		var scale_y = this.height/sch_h;
		this.scale = Math.pow(zoom_factor,Math.ceil(Math.log(Math.min(scale_x,scale_y))/Math.log(zoom_factor)));
		if (this.scale < zoom_min) this.scale = zoom_min;
		else if (this.scale > zoom_max) this.scale = zoom_max;

		// center the schematic
		this.origin_x = (this.bbox[2] + this.bbox[0])/2 - this.width/(2*this.scale);
		this.origin_y = (this.bbox[3] + this.bbox[1])/2 - this.height/(2*this.scale);
		}

		this.redraw_background();
	};

	Schematic.prototype.cut = function() {
	    // clear previous contents
	    sch_clipboard = [];

	    // look for selected components, move them to clipboard.
	    for (let i = this.components.length - 1; i >=0; --i) {
	    	var c = this.components[i];
	    	if (c.selected) {
	    		c.remove();
	    		sch_clipboard.push(c);
	    	}
	    }

	    // update diagram view
	    this.redraw();
	};

	Schematic.prototype.copy = function() {
	    // clear previous contents
	    sch_clipboard = [];

	    // look for selected components, copy them to clipboard.
	    for (let i = this.components.length - 1; i >=0; --i) {
	    	var c = this.components[i];
	    	if (c.selected)
	    		sch_clipboard.push(c.clone(c.x,c.y));
	    }
	};

	Schematic.prototype.paste = function() {
	    // compute left,top of bounding box for origins of
	    // components in the clipboard
	    var left = undefined;
	    var top = undefined;
	    for (let i = sch_clipboard.length - 1; i >= 0; --i) {
	    	let c = sch_clipboard[i];
	    	left = left ? Math.min(left,c.x) : c.x;
	    	top = top ? Math.min(top,c.y) : c.y;
	    }

	    this.message('cursor '+this.cursor_x+','+this.cursor_y);

	    // clear current selections
	    this.unselect_all(-1);
	    this.redraw_background();  // so we see any components that got unselected

	    // make clones of components on the clipboard, positioning
	    // them relative to the cursor
	    for (let i = sch_clipboard.length - 1; i >= 0; --i) {
	    	let c = sch_clipboard[i];
	    	var new_c = c.clone(this.cursor_x + (c.x - left),this.cursor_y + (c.y - top));
	    	new_c.set_select(true);
	    	new_c.add(this);
	    }

	    this.redraw();
	};

	Schematic.prototype.delete_selected = function () {
		// delete selected components
		for (let i = this.components.length - 1; i >= 0; --i) {
			var component = this.components[i];
			if (component.selected) component.remove();
		}
		this.clean_up_wires();
		this.redraw();
	};

	Schematic.prototype.rotate_selected = function () {
		// rotate selected components
		for (let i = this.components.length - 1; i >= 0; --i) {
			var component = this.components[i];
			if (component.selected) {
				component.rotate(1);
				this.check_wires(component);
			}
		}
		this.clean_up_wires();
		this.redraw();
	};	

	///////////////////////////////////////////////////////////////////////////////
	//
	//  Netlist and Simulation interface
	//
	////////////////////////////////////////////////////////////////////////////////

	// load diagram from JSON representation
	Schematic.prototype.load_schematic = function(value,initial_value) {
	    // use default value if no schematic info in value
	    if (value == undefined || value.indexOf('[') == -1)
	    	value = initial_value;
	    if (value && value.indexOf('[') != -1) {
			// convert string value into data structure
			var json = JSON.parse(value);

			// top level is a list of components
			for (let i = json.length - 1; i >= 0; --i) {
				var c = json[i];
				if (c[0] == 'view') {
					this.ac_fstart = c[5];
					this.ac_fstop = c[6];
					this.ac_pile_name = c[7];
					this.tran_npts = c[8];
					this.tran_tstop = c[9];
					this.dc_max_iters = c[10];
				} else if (c[0] == 'w') {
				// wire
				this.add_wire(c[1][0],c[1][1],c[1][2],c[1][3]);
				} else if (c[0] == 'dc') {
					this.dc_results = c[1];
				} else if (c[0] == 'transient') {
					this.transient_results = c[1];
				} else if (c[0] == 'ac') {
					this.ac_results = c[1];
				} else {
					// ordinary component
					//  c := [type, coords, properties, connections]
					var type = c[0];
					var coords = c[1];
					var properties = c[2];

					var part = new parts_map[type][0](coords[0],coords[1],coords[2]);
					for (let name in properties)
						part.properties[name] = properties[name];

					part.add(this);
				}
			}
		}

		this.redraw_background();
	};

	// label all the nodes in the circuit
	Schematic.prototype.label_connection_points = function() {
	    // start by clearing all the connection point labels
	    for (let i = this.components.length - 1; i >=0; --i)
	    	this.components[i].clear_labels();

	    // components are in charge of labeling their unlabeled connections.
	    // labels given to connection points will propagate to coincident connection
	    // points and across Wires.

	    // let special components like GND label their connection(s)
	    for (let i = this.components.length - 1; i >=0; --i)
	    	this.components[i].add_default_labels();

	    // now have components generate labels for unlabeled connections
	    this.next_label = 0;
	    for (let i = this.components.length - 1; i >=0; --i)
	    	this.components[i].label_connections();
	};

	Schematic.prototype.get_next_label = function() {
	    // generate next label in sequence
	    this.next_label += 1;
	    return this.next_label.toString();
	};

	// propagate label to coincident connection points
	Schematic.prototype.propagate_label = function(label,location) {
		var cplist = this.connection_points[location];
		for (let i = cplist.length - 1; i >= 0; --i)
			cplist[i].propagate_label(label);
	};

	// update the value field of our corresponding input field with JSON
	// representation of schematic
	Schematic.prototype.update_value = function() {
	    // label connection points
	    this.label_connection_points();

	    // build JSON data structure, convert to string value for
	    // input field
	    this.input.value = JSON.stringify(this.json_with_analyses());
	};

	Schematic.prototype.json = function() {
		var json = [];

	    // output all the components/wires in the diagram
	    var n = this.components.length;
	    for (let i = 0; i < n; i++)
	    	json.push(this.components[i].json(i));

	    // capture the current view parameters
	    json.push(['view',this.origin_x,this.origin_y,this.scale,
	    	this.ac_npts,this.ac_fstart,this.ac_fstop,
	    	this.ac_pile_name,this.tran_npts,this.tran_tstop,
	    	this.dc_max_iters]);

	    return json;
	};

	Schematic.prototype.json_with_analyses = function() {
		var json = this.json();

		if (this.dc_results != undefined) json.push(['dc',this.dc_results]);
		if (this.ac_results != undefined) json.push(['ac',this.ac_results]);
		if (this.transient_results != undefined) json.push(['transient',this.transient_results]);

		return json;
	};

	///////////////////////////////////////////////////////////////////////////////
	//
	//  Simulation interface
	//
	////////////////////////////////////////////////////////////////////////////////

	Schematic.prototype.save_netlist = function() {
	    // give circuit nodes a name, download netlist to client 
	    this.label_connection_points();
	    var netlist = this.json();
	    this.input.value = JSON.stringify(netlist);

	    download(this.input.value, "ckt.txt", "text/plain");

	    // Also save data to the browser's local store
		localStorage.setItem("ckt", this.input.value);
		console.log("Saved ckt.txt to Downloads and localStorage... ");
		console.log(localStorage.getItem("ckt"));
	};

	Schematic.prototype.exportasimage_netlist = function() {
	    // give circuit nodes a name, download netlist to client 
	    //<![CDATA[


			var canvas = document.getElementById("canvas");
				
			  var image = canvas.toDataURL();
			  download(image, "ckt.jpg", "image/jpg");
			
			
			
			
			  //]]>
	};

	Schematic.prototype.share_link = function() {
	//create and display a sharable link	
	    this.label_connection_points();	// give circuit nodes a name
	    var netlist = this.json();
	    var value = JSON.stringify(netlist);
	    this.input.value = value;
		var value_enc = encodeURIComponent(value);

	    // prepare a dialog box with sharable link
	    var link_lbl = 'Link';
		var fields = [];
		fields[link_lbl] = build_input('text',60,strSimulator + '?value=' + value_enc);
		var content = build_table(fields);
		content.fields = fields;
		content.sch = this;

		this.dialog(window.parent.M.str.atto_circuit.sharable_link,content,function(content) {
			return null;
		});

		//echo encoded and decoded link to console
		console.log('Encoded link...');
		console.log(strSimulator + '?value=' + value_enc);
		console.log('Decoded link...');
		console.log(strSimulator + '?value=' + value);
	};

	Schematic.prototype.open_netlist = function() {
		this.unselect_all(-1);
		this.redraw_background();

		if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|BB|PlayBook|IEMobile|Windows Phone|Kindle|Silk|Opera Mini/i.test(navigator.userAgent)) {
	        // Any mobile platform: load stored ctk from browser's localStorage
	        if (window.confirm('Open a netlist?')){
		        var imported_netlist = localStorage.getItem("ckt");

				this.components = [];
				this.connection_points = [];
				this.load_schematic(imported_netlist);
				this.zoomall();

				console.log( "ckt from localStorage = " + imported_netlist);
			}
		} else {
			// Desktop: load ckt from client's file system
			var file_lbl = 'Select_netlist';

			var fields = [];
			fields[file_lbl] = build_input('file',10,'');

			var content = build_table(fields);
			content.fields = fields;
			content.sch = this;

			this.dialog(window.parent.M.str.atto_circuit.open_netlist,content,function(content) {
				var sch = content.sch;

			    // retrieve parameters, remember for next time
			    var files = content.fields[file_lbl].files;
			    console.log(files);

			    // files is a FileList of File objects. List some properties.
			    if (files.length > 0) {
			    	var file = files[0];
			    	var reader = new FileReader();

			    	// print out the result when the file is finished loading
			    	reader.onload = function(e) {
			    		var imported_netlist = e.target.result;

			    		content.sch.components = [];
			    		content.sch.connection_points = [];
			    		content.sch.load_schematic(imported_netlist);
			    		content.sch.zoomall();

			    		console.log(e.target.result);
			    	};

	            	// start reading the file
	            	reader.readAsText(file);
	            }
	        });
		}
	};

	Schematic.prototype.extract_circuit = function() {
	    // give all the circuit nodes a name, extract netlist
	    this.label_connection_points();
	    var netlist = this.json();

	    // since we've done the heavy lifting, update input field value
	    // so user can grab diagram if they want
	    this.input.value = JSON.stringify(netlist);

	    // create a circuit from the netlist
	    var ckt = new cktsim.Circuit();
	    if (ckt.load_netlist(netlist))
	    	return ckt;
	    else
	    	return null;
	};

	Schematic.prototype.dc_analysis = function() {
	    // remove any previous annotations
	    this.unselect_all(-1);
	    this.redraw_background();

	    var ckt = this.extract_circuit();
	    if (ckt === null) return;

	    // run the analysis
	    this.operating_point = ckt.dc();

	    if (this.operating_point != undefined) {
			// save a copy of the results for submission
			this.dc_results = {};
			for (let i in this.operating_point) this.dc_results[i] = this.operating_point[i];

			// display results on diagram
			this.redraw();
		}
	};

	// return a list of [color,node_label,offset,type] for each probe in the diagram
	// type == 'voltage' or 'current'
	Schematic.prototype.find_probes = function() {
		var result = [];
		for (let i = this.components.length - 1; i >= 0; --i) {
			var c = this.components[i];
			var info = c.probe_info();
			if (info != undefined) result.push(c.probe_info());
		}
		return result;
	};

	// use a dialog to get AC analysis parameters
	Schematic.prototype.setup_ac_analysis = function() {
		this.unselect_all(-1);
		this.redraw_background();

		//var npts_lbl = 'points_per_decade';	//'Number of points per decade';	//not used
		var fstart_lbl = 'Starting_frequency';
		var fstop_lbl = 'Ending_frequency';
		var pile_name_lbl = 'pile_for_ac';		//'Name of V or I pile for ac';

		if (this.find_probes().length == 0) {
			//alert("AC Analysis: add a voltage probe to the diagram!");
			alert(window.parent.M.str.atto_circuit.AC_analysis_add_a_voltage_probe);
			return;
		}

		var fields = [];
		fields[fstart_lbl] = build_input('text',10,this.ac_fstart);
		fields[fstop_lbl] = build_input('text',10,this.ac_fstop);
		fields[pile_name_lbl] = build_input('text',10,this.ac_pile_name);

		var content = build_table(fields);
		content.fields = fields;
		content.sch = this;

		this.dialog(window.parent.M.str.atto_circuit.AC_analysis,content,function(content) {
			var sch = content.sch;

		    // retrieve parameters, remember for next time
		    sch.ac_fstart = content.fields[fstart_lbl].value;
		    sch.ac_fstop = content.fields[fstop_lbl].value;
		    sch.ac_pile_name = content.fields[pile_name_lbl].value;

		    sch.ac_analysis(cktsim.parse_number(sch.ac_npts),
		    	cktsim.parse_number(sch.ac_fstart),
		    	cktsim.parse_number(sch.ac_fstop),
		    	sch.ac_pile_name);
		});
	};

	Schematic.prototype.ac_analysis = function(npts,fstart,fstop,ac_pile_name) {
		var ckt = this.extract_circuit();
		if (ckt === null) return;
		var results = ckt.ac(npts,fstart,fstop,ac_pile_name);

		if (typeof results == 'string') 
			this.message(results);
		else {
			var x_values = results._frequencies_;

		// x axis will be a log scale
		for (let i = x_values.length - 1; i >= 0; --i)
			x_values[i] = Math.log(x_values[i])/Math.LN10;

		if (this.submit_analyses != undefined) {
			var submit = this.submit_analyses.ac;
			if (submit != undefined) {
				// save a copy of the results for submission
				this.ac_results = {};

				// save requested values for each requested node
				for (let j = 0; j < submit.length; j++) {
				    var flist = submit[j];    // [node_name,f1,f2,...]
				    var node = flist[0];
				    let values = results[node];
				    var fvlist = [];
				    // for each requested freq, interpolate response value
				    for (let k = 1; k < flist.length; k++) {
				    	let f = flist[k];
				    	let v = interpolate(f,x_values,values);
						// convert to dB
						fvlist.push([f,v == undefined ? 'undefined' : 20.0 * Math.log(v)/Math.LN10]);
					}
				    // save results as list of [f,response] paris
				    this.ac_results[node] = fvlist;
				}
			}
		}

		// set up plot values for each node with a probe
		var y_values = [];  // list of [color, result_array]
		var z_values = [];  // list of [color, result_array]
		var probes = this.find_probes();
		var probe_maxv = [];
		var probe_color = [];

		// Check for probe with near zero transfer function and warn
		for (let i = probes.length - 1; i >= 0; --i) {
			if (probes[i][3] != 'voltage') continue;
			probe_color[i] = probes[i][0];
			var label = probes[i][1];
			let v = results[label];
		    probe_maxv[i] = array_max(v); // magnitudes always > 0
		}

		var all_max = array_max(probe_maxv);
		if (all_max < 1.0e-16) {
			//alert('Zero ac response, -infinity on DB scale.');
			alert(window.parent.M.str.atto_circuit.zero_ac_response);
		} else {
			for (let i = probes.length - 1; i >= 0; --i) {
				if (probes[i][3] != 'voltage') continue;
				if ((probe_maxv[i] / all_max) < 1.0e-10) {
					//alert('Near zero ac response, remove ' + probe_color[i] + ' probe');
					alert(window.parent.M.str.atto_circuit.near_zero_ac_response + probe_color[i] + window.parent.M.str.atto_circuit.probe);
					return;
				}
			}
		}

		for (let i = probes.length - 1; i >= 0; --i) {
			if (probes[i][3] != 'voltage') continue;
			let color = probes[i][0];
			let label = probes[i][1];
			let offset = cktsim.parse_number(probes[i][2]);
			let v = results[label];
		    // convert values into dB relative to pile amplitude
		    let v_max = 1;
		    for (let j = v.length - 1; j >= 0; --j)
			// convert each value to dB relative to max
			v[j] = 20.0 * Math.log(v[j]/v_max)/Math.LN10;
			y_values.push([color,offset,v]);

			v = results[label+'_phase'];
			z_values.push([color,0,v]);
		}

		// graph the result and display in a window
		var graph2 = this.graph(x_values,window.parent.M.str.atto_circuit.log_frequency,z_values,window.parent.M.str.atto_circuit.degrees);
		this.window(window.parent.M.str.atto_circuit.AC_phase,graph2,0,true);
		var graph1 = this.graph(x_values,window.parent.M.str.atto_circuit.log_frequency,y_values,'dB');
		this.window(window.parent.M.str.atto_circuit.AC_magnitude,graph1,50,true);
		}
	};

	Schematic.prototype.transient_analysis = function() {
		this.unselect_all(-1);
		this.redraw_background();

		//var npts_lbl = 'Minimum_number_of_timepoints';	//not used
		var tstop_lbl = 'Stop_time_seconds';
		var probes = this.find_probes();
		if (probes.length == 0) {
			alert(window.parent.M.str.atto_circuit.transient_analysis_add_a_probe);
			return;
		}

		var fields = [];
		fields[tstop_lbl] = build_input('text',10,this.tran_tstop);

		var content = build_table(fields);
		content.fields = fields;
		content.sch = this;

		this.dialog(window.parent.M.str.atto_circuit.transient_analysis,content,function(content) {
			var sch = content.sch;
			var ckt = sch.extract_circuit();
			if (ckt === null) return;

		    // retrieve parameters, remember for next time
		    sch.tran_tstop = content.fields[tstop_lbl].value;

		    // gather a list of nodes that are being probed.  These
		    // will be added to the list of nodes checked during the
		    // LTE calculations in transient analysis
		    var probe_list = sch.find_probes();
		    var probe_names = new Array(probe_list.length);
		    for (let i = probe_list.length - 1; i >= 0; --i)
		    	probe_names[i] = probe_list[i][1];

		    // run the analysis
		    var results = ckt.tran(ckt.parse_number(sch.tran_npts), 0,
		    	ckt.parse_number(sch.tran_tstop), probe_names, false);

		    if (typeof results == 'string') 
		    	sch.message(results);
		    else {
		    	if (sch.submit_analyses != undefined) {
		    		var submit = sch.submit_analyses.tran;
		    		if (submit != undefined) {
						// save a copy of the results for submission
						sch.transient_results = {};
						var times = results._time_;

						// save requested values for each requested node
						for (let j = 0; j < submit.length; j++) {
						    var tlist = submit[j];    // [node_name,t1,t2,...]
						    var node = tlist[0];
						    let values = results[node];
						    var tvlist = [];
						    // for each requested time, interpolate waveform value
						    for (let k = 1; k < tlist.length; k++) {
						    	let t = tlist[k];
						    	let v = interpolate(t,times,values);
						    	tvlist.push([t,v == undefined ? 'undefined' : v]);
						    }
						    // save results as list of [t,value] pairs
						    sch.transient_results[node] = tvlist;
						}
					}
				}

				var x_values = results._time_;
				var x_legend = window.parent.M.str.atto_circuit.time;

				// set up plot values for each node with a probe
				var v_values = [];  // voltage values: list of [color, result_array]
				var i_values = [];  // current values: list of [color, result_array]
				var probes = sch.find_probes();

				for (let i = probes.length - 1; i >= 0; --i) {
					let color = probes[i][0];
					let label = probes[i][1];
					let offset = cktsim.parse_number(probes[i][2]);
					let v = results[label];
					if (v == undefined) {
						alert(window.parent.M.str.atto_circuit.The + color + window.parent.M.str.atto_circuit.probe_is_connected_to_node + '"' + label + '"' + window.parent.M.str.atto_circuit.which_is_not_an_actual_circuit_node);
					} else if (probes[i][3] == 'voltage') {
						if (color == 'xaxis') {
							x_values = v;
							x_legend = window.parent.M.str.atto_circuit.voltage;
						} else v_values.push([color,offset,v]);
					} else {
						if (color == 'xaxis') {
							x_values = v;
							x_legend = window.parent.M.str.atto_circuit.current;
						} else i_values.push([color,offset,v]);
					}
				}

				// graph the result and display in a window
				var graph = sch.graph(x_values,x_legend,v_values,window.parent.M.str.atto_circuit.voltage,i_values,window.parent.M.str.atto_circuit.current);
				sch.window(window.parent.M.str.atto_circuit.transient_analysis,graph,0, true);
			}
		});
	};

	// t is the time at which we want a value
	// times is a list of timepoints from the simulation
	function interpolate(t,times,values) {
		if (values == undefined) return undefined;

		for (let i = 0; i < times.length; i++)
			if (t < times[i]) {
		    // t falls between times[i-1] and times[i]
		    let t1 = (i == 0) ? times[0] : times[i-1];
		    let t2 = times[i];

		    if (t2 == undefined) return undefined;

		    let v1 = (i == 0) ? values[0] : values[i-1];
		    let v2 = values[i];
		    let v = v1;
		    if (t != t1) v += (t - t1)*(v2 - v1)/(t2 - t1);
		    return v;
		}
	}

	// external interface for setting the property value of a named component
	Schematic.prototype.set_property = function(component_name,property,value) {
		this.unselect_all(-1);

		for (let i = this.components.length - 1; i >= 0; --i) {
			var component = this.components[i];
			if (component.properties.name == component_name) {
				component.properties[property] = value.toString();
				break;
			}
		}

		this.redraw_background();
	};

	///////////////////////////////////////////////////////////////////////////////
	//
	//  Drawing support -- deals with scaling and scrolling of diagrama
	//
	////////////////////////////////////////////////////////////////////////////////

	// here to redraw background image containing static portions of the schematic.
	// Also redraws dynamic portion.
	Schematic.prototype.redraw_background = function() {
		var c = this.bg_image.getContext('2d');
		//c.scale(2,2);	//retina display - doesn't look good

		c.lineCap = 'round';	// butt(D) | *round | square

	    // paint background color
	    c.fillStyle = element_style;
	    c.fillRect(0,0,this.width,this.height);

	    if (!this.diagram_only && this.show_grid) {
			// grid
			c.strokeStyle = grid_style;
			var first_x = this.origin_x;
			var last_x = first_x + this.width/this.scale;
			var first_y = this.origin_y;
			var last_y = first_y + this.height/this.scale;

			for (let i = this.grid*Math.ceil(first_x/this.grid); i < last_x; i += this.grid)
				this.draw_line(c,i,first_y,i,last_y,1);

			for (let i = this.grid*Math.ceil(first_y/this.grid); i < last_y; i += this.grid)
				this.draw_line(c,first_x,i,last_x,i,1);
		}

	    // unselected components
	    var min_x = Infinity;  // compute bounding box for diagram
	    var max_x = -Infinity;
	    var min_y = Infinity;
	    var max_y = -Infinity;
	    for (let i = this.components.length - 1; i >= 0; --i) {
	    	var component = this.components[i];
	    	if (!component.selected) {
	    		component.draw(c);
	    		min_x = Math.min(component.bbox[0],min_x);
	    		max_x = Math.max(component.bbox[2],max_x);
	    		min_y = Math.min(component.bbox[1],min_y);
	    		max_y = Math.max(component.bbox[3],max_y);
	    	}
	    }
	    this.unsel_bbox = [min_x,min_y,max_x,max_y];
	    this.redraw();   // background changed, redraw on screen
	};

	// redraw what user sees = static image + dynamic parts
	Schematic.prototype.redraw = function() {
		var c = this.canvas.getContext('2d');

	    // put static image in the background
	    c.drawImage(this.bg_image, 0, 0);

	    // selected components
	    var min_x = this.unsel_bbox[0];   // compute bounding box for diagram
	    var max_x = this.unsel_bbox[2];
	    var min_y = this.unsel_bbox[1];
	    var max_y = this.unsel_bbox[3];
	    var selections = false;
	    for (let i = this.components.length - 1; i >= 0; --i) {
	    	var component = this.components[i];
	    	if (component.selected) {
	    		component.draw(c);
	    		selections = true;
	    		min_x = Math.min(component.bbox[0],min_x);
	    		max_x = Math.max(component.bbox[2],max_x);
	    		min_y = Math.min(component.bbox[1],min_y);
	    		max_y = Math.max(component.bbox[3],max_y);
	    	}
	    }
	    if (min_x == Infinity) this.bbox = [0,0,0,0];
	    else this.bbox = [min_x,min_y,max_x,max_y];
	    this.enable_tool('cut',selections);
	    this.enable_tool('copy',selections);
	    this.enable_tool('paste',sch_clipboard.length > 0);
	    this.enable_tool('delete',selections);
	    this.enable_tool('rotate',selections);

	    // connection points: draw one at each location
	    for (let location in this.connection_points) {
	    	var cplist = this.connection_points[location];
	    	cplist[0].draw(c,cplist.length);
	    }

	    // draw new wire
	    if (this.wire) {
	    	let r = this.wire;
	    	c.strokeStyle = selected_style;
	    	this.draw_line(c,r[0],r[1],r[2],r[3],1);
	    }

	    // draw selection rectangle
	    if (this.select_rect) {
	    	let r = this.select_rect;
	    	c.lineWidth = 1;
	    	c.strokeStyle = selected_style;
	    	c.beginPath();
	    	c.moveTo(r[0],r[1]);
	    	c.lineTo(r[0],r[3]);
	    	c.lineTo(r[2],r[3]);
	    	c.lineTo(r[2],r[1]);
	    	c.lineTo(r[0],r[1]);
	    	c.stroke();
	    }

	    // display operating point results
	    if (this.operating_point) {
	    	if (typeof this.operating_point == 'string')
	    		this.message(this.operating_point);
	    	else {
		    // make a copy of the operating_point info so we can mess with it
		    let temp = [];
		    for (let i in this.operating_point) temp[i] = this.operating_point[i];

		    // run through connection points displaying (once) the voltage
		    // for each electrical node
		    for (let location in this.connection_points)
		    	(this.connection_points[location])[0].display_voltage(c,temp);

		    // let components display branch current info if available
		    for (let i = this.components.length - 1; i >= 0; --i)
		    	this.components[i].display_current(c,temp);
			}
		}

	    //scroll/zoom/rotate/delete controls
	    if (!this.diagram_only) {
	    	var o = 0.5;		// half pixel offset for sharp lines with odd pixel width
	    	let r = this.sctl_r;
	    	let x = this.sctl_x+o;
	    	let y = this.sctl_y+o;

			// filled circle with border
			c.fillStyle = element_style;
			c.beginPath();
			c.arc(x,y,r,0,2*Math.PI);
			c.fill();

			c.strokeStyle = stroke_style;
			c.lineWidth = 0.5;
			c.beginPath();
			c.arc(x,y,r,0,2*Math.PI);
			c.stroke();

			// direction markers for scroll
			c.lineWidth = 2;
			c.beginPath();

			c.moveTo(x + 4,y - r + 8);   // north
			c.lineTo(x,y - r + 4);
			c.lineTo(x - 4,y - r + 8);

			c.moveTo(x + r - 8,y + 4);   // east
			c.lineTo(x + r - 4,y);
			c.lineTo(x + r - 8,y - 4);

			c.moveTo(x + 4,y + r - 8);   // south
			c.lineTo(x,y + r - 4);
			c.lineTo(x - 4,y + r - 8);

			c.moveTo(x - r + 8,y + 4);   // west
			c.lineTo(x - r + 4,y);
			c.lineTo(x - r + 8,y - 4);

			c.stroke();

			// zoom control
			x = this.zctl_x;
			y = this.zctl_y;
			var w = this.zctl_w;
			var h = this.zctl_h;
			var s = 6;			// 1/2 horiz stroke length
			var t = 12;			//     vert symbol spacing
			c.lineWidth = 0.5;
			c.fillStyle = element_style;    // background
			c.fillRect(x-w/2+o,y+o,w,h);
			c.strokeStyle = stroke_style;     // border
			c.strokeRect(x-w/2+o,y+o,w,h);
			c.lineWidth = 1;
			c.beginPath();
			// zoom in plus
			c.moveTo(x-s,y+t+o); c.lineTo(x+s+1,y+t+o); c.moveTo(x+o,y+t-s); c.lineTo(x+o,y+t+s+1);
			// zoom out minus
			c.moveTo(x-s,y+3*t+o); c.lineTo(x+s+1,y+3*t+o);
			// zoom all box
			c.strokeRect(x-s+o,y+4*t+t/2+o,2*s,2*s);
			c.stroke();
/*
			// rotate control
			r = this.rctl_r;
			x = this.rctl_x+o;
			y = this.rctl_y+o;

			// filled circle with border
			c.fillStyle = element_style;
			c.beginPath();
			c.arc(x,y,r,0,2*Math.PI);
			c.fill();

			c.strokeStyle = stroke_style;
			c.lineWidth = 0.5;
			c.beginPath();
			c.arc(x,y,r,0,2*Math.PI);
			c.stroke();

			c.lineWidth = 3;				//curved rotation arrow
			r = this.sctl_r - 8;
			c.fillStyle = stroke_style;
			c.beginPath();
			c.arc(x,y,r,Math.PI/4,15*Math.PI/8);	// 3/4 circle, angles are clockwise from 3:00
			c.stroke();
			c.lineWidth = 3;		
			c.beginPath();   				// arrowhead
			c.moveTo(x + 2,y-3);			// start
			c.lineTo(x + 8,y-3);			// straight right to tip
			c.lineTo(x + 8,y-9);			// straight up
			c.stroke();
		
		    // delete control
		    r = this.dctl_r;
		    x = this.dctl_x+o;
		    y = this.dctl_y+o;

			// filled circle with border
			c.fillStyle = element_style;
			c.beginPath();
			c.arc(x,y,r,0,2*Math.PI);
			c.fill();

			c.strokeStyle = stroke_style;
			c.lineWidth = 0.5;
			c.beginPath();
			c.arc(x,y,r,0,2*Math.PI);
			c.stroke();

			c.lineWidth = 5;	// big X
			c.lineCap = 'round';
			c.beginPath();
			c.moveTo(x - 5,y - 5);
			c.lineTo(x + 5,y + 5);
			c.moveTo(x + 5,y - 5);
			c.lineTo(x - 5,y + 5);
			c.stroke();*/
		}
	};

	// draws a cross cursor
	Schematic.prototype.cross_cursor = function(c,x,y) {
		this.draw_line(c,x-this.grid,y,x+this.grid,y,1);
		this.draw_line(c,x,y-this.grid,x,y+this.grid,1);
	};

	Schematic.prototype.moveTo = function(c,x,y) {
		c.moveTo((x - this.origin_x) * this.scale,(y - this.origin_y) * this.scale);
	};

	Schematic.prototype.lineTo = function(c,x,y) {
		c.lineTo((x - this.origin_x) * this.scale,(y - this.origin_y) * this.scale);
	};

	Schematic.prototype.draw_line = function(c,x1,y1,x2,y2,width) {
		c.lineWidth = width*this.scale;
		c.beginPath();
		c.moveTo((x1 - this.origin_x) * this.scale,(y1 - this.origin_y) * this.scale);
		c.lineTo((x2 - this.origin_x) * this.scale,(y2 - this.origin_y) * this.scale);
		c.stroke();
	};

	Schematic.prototype.draw_arc = function(c,x,y,radius,start_radians,end_radians,anticlockwise,width,filled) {
		c.lineWidth = width*this.scale;
		c.beginPath();
		c.arc((x - this.origin_x)*this.scale,(y - this.origin_y)*this.scale,radius*this.scale,
			start_radians,end_radians,anticlockwise);
		if (filled) c.fill();
		else c.stroke();
	};

	Schematic.prototype.draw_text = function(c,text,x,y,size) {
		c.font = size*this.scale+'pt sans-serif';
		c.fillText(text,(x - this.origin_x) * this.scale,(y - this.origin_y) * this.scale);
	};

	// add method to canvas to compute relative coords for event
	try {
		if (HTMLCanvasElement)
			HTMLCanvasElement.prototype.relMouseCoords = function(event){
		    // run up the DOM tree to figure out coords for top,left of canvas
		    var totalOffsetX = 0;
		    var totalOffsetY = 0;
		    var currentElement = this;
		    do {
		    	totalOffsetX += currentElement.offsetLeft;
		    	totalOffsetY += currentElement.offsetTop;
		    }
		    while (currentElement = currentElement.offsetParent);

		    // now compute relative position of click within the canvas
		    this.mouse_x = event.pageX - totalOffsetX;
		    this.mouse_y = event.pageY - totalOffsetY;
		    this.page_x = event.pageX;
		    this.page_y = event.pageY;
		};
	}
	catch (err) { // ignore
	}

	///////////////////////////////////////////////////////////////////////////////
	//
	//  Event handling
	//
	////////////////////////////////////////////////////////////////////////////////

	// process keystrokes, consuming those that are meaningful to us
	function schematic_key_down(event) {
		if (!event) event = window.event;
		var sch = event.target.schematic;
		var code = event.keyCode;

	    // keep track of modifier key state
	    if (code == 16) sch.shiftKey = true;
	    else if (code == 17) sch.ctrlKey = true;
	    else if (code == 18) sch.altKey = true;
	    else if (code == 91) sch.cmdKey = true;

	    // backspace or delete: delete selected components
	    else if (code == 8 || code == 46) {
		// delete selected components
		for (let i = sch.components.length - 1; i >= 0; --i) {
			var component = sch.components[i];
			if (component.selected) component.remove();
		}
		sch.clean_up_wires();
		sch.redraw_background();
		event.preventDefault();
		return false;
	}

	    // cmd/ctrl x: cut
	    else if ((sch.ctrlKey || sch.cmdKey) && code == 88) {
	    	sch.cut();
	    	event.preventDefault();
	    	return false;
	    }

	    // cmd/ctrl c: copy
	    else if ((sch.ctrlKey || sch.cmdKey) && code == 67) {
	    	sch.copy();
	    	event.preventDefault();
	    	return false;
	    }

	    // cmd/ctrl v: paste
	    else if ((sch.ctrlKey || sch.cmdKey) && code == 86) {
	    	sch.paste();
	    	event.preventDefault();
	    	return false;
	    }

	    // 'r': rotate component
	    else if (!sch.ctrlKey && !sch.altKey && !sch.cmdKey && code == 82) {
	    	sch.rotate_selected();
	    	event.preventDefault();
	    	return false;
	    }

	    else return true;

	    // consume keystroke
	    sch.redraw();
	    event.preventDefault();
	    return false;
	}

	function schematic_key_up(event) {
		if (!event) event = window.event;
		var sch = event.target.schematic;
		var code = event.keyCode;

		if (code == 16) sch.shiftKey = false;
		else if (code == 17) sch.ctrlKey = false;
		else if (code == 18) sch.altKey = false;
		else if (code == 91) sch.cmdKey = false;
	}

	function schematic_mouse_enter(event) {
		if (!event) event = window.event;
		var sch = event.target.schematic;

	    // see if user has selected a new part
	    if (sch.new_part) {
		// grab incoming part, turn off selection of parts bin
		var part = sch.new_part;
		sch.new_part = undefined;
		part.select(false);

		// unselect everything else in the schematic, add part and select it
		sch.unselect_all(-1);
		sch.redraw_background();  // so we see any components that got unselected

		// make a clone of the component in the parts bin
		part = part.component.clone(sch.cursor_x,sch.cursor_y);
		part.add(sch);  // add it to schematic
		part.set_select(true);

		// and start dragging it
		sch.drag_begin();
	}

	sch.drawCursor = true;
	sch.redraw();
	    sch.canvas.focus();  // capture key strokes
	    return false;
	}

	function schematic_mouse_leave(event) {
		if (!event) event = window.event;
		var sch = event.target.schematic;
		sch.drawCursor = false;
		sch.redraw();
		return false;
	}

	function schematic_mouse_down(event, sch) {
		var mx = sch.canvas.mouse_x;
		var my = sch.canvas.mouse_y;
		var sx = mx - sch.sctl_x;
		var sy = my - sch.sctl_y;
		var zx = mx - sch.zctl_x;
		var zy = my - sch.zctl_y;
		var rx = mx - sch.rctl_x;
		var ry = my - sch.rctl_y;
		var dx = mx - sch.dctl_x;
		var dy = my - sch.dctl_y;
		var zw = sch.zctl_w;
		var zh = sch.zctl_h;

	    if (sx*sx + sy*sy <= sch.sctl_r*sch.sctl_r) {   // clicked in scrolling control
		// check which quadrant
		if (Math.abs(sy) > Math.abs(sx)) {  // N or S
			let delta = sch.height / 8;
			if (sy > 0) delta = -delta;
			let temp = sch.origin_y - delta;
			if (temp > origin_min*sch.grid && temp < origin_max*sch.grid) sch.origin_y = temp;
		} else {			    			// E or W
			let delta = sch.width / 8;
			if (sx < 0) delta = -delta;
			let temp = sch.origin_x + delta;
			if (temp > origin_min*sch.grid && temp < origin_max*sch.grid) sch.origin_x = temp;
		}
	    } else if (zx >= -zw/2 && zx < zw/2 && zy >= 0 && zy < zh) {   // clicked in zoom control
	    	if (zy < zh/3) sch.zoomin();
	    	else if (zy < 2*zh/3) sch.zoomout();
	    	else sch.zoomall();
	    } 
	    else if (rx*rx + ry*ry <= sch.rctl_r*sch.rctl_r) {   // clicked in rotation control
	    	sch.rotate_selected();
	    	event.preventDefault();
	    	return false;
	    } 
	    else if (dx*dx + dy*dy <= sch.rctl_r*sch.rctl_r) {   // clicked in delete control
	    	sch.delete_selected();
	    	event.preventDefault();
	    	return false;
	    } else {											//clicked in schematic area
	    	var x = mx/sch.scale + sch.origin_x;
	    	var y = my/sch.scale + sch.origin_y;
	    	sch.cursor_x = Math.round(x/sch.grid) * sch.grid;
	    	sch.cursor_y = Math.round(y/sch.grid) * sch.grid;

		// is mouse over a connection point?  If so, start dragging a wire
		var cplist = sch.connection_points[sch.cursor_x + ',' + sch.cursor_y];
		if (cplist && !event.shiftKey) {
		    //sch.unselect_all(-1);		//commented out for touch
		    //With touch, we can't drag a new part onto the schematic (there isn't a "touch_enter" event).
		    //So we do a "tap-tap" sequence to add parts. 
		    //Parts are selected from the bin and added to the component list (add_part). 
		    //The next tap inside the schematic area places the new part.
		    //If we uncomment the unselect_all above, it would unselect the pending new component and it does not get placed. 
		    //Side effect: Commenting out unselect_all above leaves any currently selected parts still selected.
		    sch.wire = [sch.cursor_x,sch.cursor_y,sch.cursor_x,sch.cursor_y];
		} else {
		    // give all components a shot at processing the selection event
		    var which = -1;
		    for (let i = sch.components.length - 1; i >= 0; --i)
		    	if (sch.components[i].select(x,y,event.shiftKey)) {
		    		if (sch.components[i].selected) {
		    			sch.drag_begin();
						which = i;  // keep track of component we found
					}
					break;
				}
		    // did we just click on a previously selected component?
		    var reselect = which!=-1 && sch.components[which].was_previously_selected;

		    if (!event.shiftKey) {
				// if shift key isn't pressed and we didn't click on component
				// that was already selected, unselect everyone except component
				// we just clicked on
				if (!reselect) sch.unselect_all(which);

				// if there's nothing to drag, set up a selection rectangle
				if (!sch.dragging) sch.select_rect = [sch.canvas.mouse_x,sch.canvas.mouse_y,
					sch.canvas.mouse_x,sch.canvas.mouse_y];
			}
		}
		}

		if (sch.new_part) {
			// grab incoming part, turn off selection of parts bin
			var part = sch.new_part;
			sch.new_part = undefined;
			part.select(false);

			// unselect everything else in the schematic, add part and select it
			sch.unselect_all(-1);
			sch.redraw_background();  // so we see any components that got unselected

			// make a clone of the component in the parts bin
			part = part.component.clone(sch.cursor_x,sch.cursor_y);
			part.add(sch);  // add it to schematic
			part.set_select(true);

			// and start dragging it
			sch.drag_begin();
		}

		sch.redraw_background();
		return false;
		}

	function schematic_mouse_move(event, sch) {
		var x = sch.canvas.mouse_x/sch.scale + sch.origin_x;
		var y = sch.canvas.mouse_y/sch.scale + sch.origin_y;
		sch.cursor_x = Math.round(x/sch.grid) * sch.grid;
		sch.cursor_y = Math.round(y/sch.grid) * sch.grid;

		if (sch.wire) {
			// update new wire end point
			sch.wire[2] = sch.cursor_x;
			sch.wire[3] = sch.cursor_y;
		} else if (sch.dragging) {
			// see how far we moved
			var dx = sch.cursor_x - sch.drag_x;
			var dy = sch.cursor_y - sch.drag_y;
			if (dx != 0 || dy != 0) {
			    // update position for next time
			    sch.drag_x = sch.cursor_x;
			    sch.drag_y = sch.cursor_y;

			    // give all components a shot at processing the event
			    for (let i = sch.components.length - 1; i >= 0; --i) {
			    	var component = sch.components[i];
			    	if (component.selected) component.move(dx,dy);
			    }
			}
		} else if (sch.select_rect) {
			// update moving corner of selection rectangle
			sch.select_rect[2] = sch.canvas.mouse_x;
			sch.select_rect[3] = sch.canvas.mouse_y;
		}

	    // just redraw dynamic components
	    sch.redraw();

		return false;
	}

	function schematic_mouse_up(event, sch) {
	    // drawing a new wire
	    if (sch.wire) {
	    	var r = sch.wire;
	    	sch.wire = undefined;

	    	if (r[0]!=r[2] || r[1]!=r[3]) {
		    // insert wire component
		    sch.add_wire(r[0],r[1],r[2],r[3]);
		    sch.clean_up_wires();
		    sch.redraw_background();
			} else sch.redraw();
		}

	    // dragging
	    if (sch.dragging) sch.drag_end();

	    // selection rectangle
	    if (sch.select_rect) {
	    	let r = sch.select_rect;

			// if select_rect is a point, we've already dealt with selection
			// in mouse_down handler
			if (r[0]!=r[2] || r[1]!=r[3]) {
			    // convert to schematic coordinates
			    var s = [r[0]/sch.scale + sch.origin_x, r[1]/sch.scale + sch.origin_y,
			    r[2]/sch.scale + sch.origin_x, r[3]/sch.scale + sch.origin_y];
			    canonicalize(s);

			    if (!event.shiftKey) sch.unselect_all();

			    // select components that intersect selection rectangle
			    for (let i = sch.components.length - 1; i >= 0; --i)
			    	sch.components[i].select_rect(s,event.shiftKey);
			}

			sch.select_rect = undefined;
			sch.redraw_background();
		}
		return false;
	}

	/* Wheel zoom commented out for smart phone. Allows normal panning of a large schematic in a small window.
	function schematic_mouse_wheel(event) {
		if (!event) event = window.event;
		else event.preventDefault();
		var sch = event.target.schematic;

		var delta = 0;
		if (event.wheelDelta) delta = event.wheelDelta;
		else if (event.detail) delta = -event.detail;

		if (delta) {
			var nscale = (delta > 0) ? sch.scale*zoom_wheel_factor : sch.scale/zoom_wheel_factor;

			if (nscale > zoom_min && nscale < zoom_max) {
			    // zoom around current mouse position
			    sch.canvas.relMouseCoords(event);
			    var s = 1.0/sch.scale - 1.0/nscale;
			    sch.origin_x += sch.canvas.mouse_x*s;
			    sch.origin_y += sch.canvas.mouse_y*s;
			    sch.scale = nscale;
			    sch.redraw_background();
			}
		}
	} */


	function schematic_double_click(event) {
		if (!event) event = window.event;
		else event.preventDefault();
		var sch = event.target.schematic;

	    // determine where event happened in schematic coordinates
	    sch.canvas.relMouseCoords(event);
	    var x = sch.canvas.mouse_x/sch.scale + sch.origin_x;
	    var y = sch.canvas.mouse_y/sch.scale + sch.origin_y;
	    sch.cursor_x = Math.round(x/sch.grid) * sch.grid;
	    sch.cursor_y = Math.round(y/sch.grid) * sch.grid;

	    // see if we double-clicked a component.  If so, edit it's properties
	    for (let i = sch.components.length - 1; i >= 0; --i)
	    	if (sch.components[i].edit_properties(x,y))
	    		break;

	    	return false;
	}

	///////////////////////////////////////////////////////////////////////////////
	//
	//  Status message and dialogs
	//
	////////////////////////////////////////////////////////////////////////////////

	Schematic.prototype.message = function(message) {
		this.status.nodeValue = message;
	};

	Schematic.prototype.append_message = function(message) {
		this.status.nodeValue += ' / '+message;
	};

	// set up a dialog with specified title, content and two buttons at
	// the bottom: OK and Cancel.  If Cancel is clicked, dialog goes away
	// and we're done.  If OK is clicked, dialog goes away and the
	// callback function is called with the content as an argument (so
	// that the values of any fields can be captured).
	Schematic.prototype.dialog = function(title,content,callback) {
	    // create the div for the top level of the dialog, add to DOM
	    var dialog = document.createElement('div');
	    dialog.sch = this;
	    dialog.content = content;
	    dialog.callback = callback;

	    // look for property input fields in the content and give
	    // them a keypress listener that interprets ENTER as
	    // clicking OK.
	    var plist = content.getElementsByClassName('property');
	    for (let i = plist.length - 1; i >= 0; --i) {
	    	var field = plist[i];
			field.dialog = dialog;  // help event handler find us...
			field.addEventListener('keypress',dialog_check_for_ENTER,false);
		}

	    // div to hold the content
	    var body = document.createElement('div');
	    content.style.marginBotton = '5px';
	    body.appendChild(content);
	    body.style.padding = '5px';
	    body.style.font = '10pt sans-serif';
	    body.style.color = normal_style;
	    dialog.appendChild(body);

	    var ok_button = document.createElement('span');
	    var ok_icon = document.createElement("span");
		ok_icon.setAttribute('class', 'fas fa-fw fa-check fa-2x');
		ok_icon.style.color = ok_style;
	    ok_icon.dialog = dialog; 
	    ok_button.appendChild(ok_icon);

	    ok_button.dialog = dialog;   // for the handler to use
	    ok_button.addEventListener('click',dialog_okay,false);
	    ok_button.style.display = 'inline';
	    ok_button.style.border = '0px solid';
	    ok_button.style.padding = '5px';
	    ok_button.style.margin = '10px';
	    ok_button.style.font = '10pt sans-serif';

	    var cancel_button = document.createElement('span');
	    var cancel_icon = document.createElement("span");
		cancel_icon.setAttribute('class', 'fas fa-fw fa-times fa-2x');
		cancel_icon.style.color = cancel_style;
	    cancel_icon.dialog = dialog;
	    cancel_button.appendChild(cancel_icon);

	    cancel_button.dialog = dialog;   // for the handler to use
	    cancel_button.addEventListener('click',dialog_cancel,false);
	    cancel_button.style.display = 'inline';
	    cancel_button.style.border = '0px solid';
	    cancel_button.style.padding = '5px';
	    cancel_button.style.margin = '10px';
	    cancel_button.style.font = '10pt sans-serif';

	    // div to hold the two buttons
	    var buttons = document.createElement('div');
	    buttons.style.textAlign = 'center';
	    buttons.appendChild(ok_button);
	    buttons.appendChild(cancel_button);
	    buttons.style.padding = '5px';
	    buttons.style.margin = '10px';
	    dialog.appendChild(buttons);

	    // put into an overlay window
	    this.window(title,dialog,20);
	};

	function dialog_cancel(event) {
		if (!event) event = window.event;
		var dialog = event.target.dialog;

		window_close(dialog.win);
	}

	function dialog_okay(event) {
		if (!event) event = window.event;
		var dialog = event.target.dialog;

		window_close(dialog.win);

		if (dialog.callback) dialog.callback(dialog.content);
	}

	// callback for keypress in input fields: if user typed ENTER, act
	// like they clicked OK button.
	function dialog_check_for_ENTER(event) {
		var key = (window.event) ? window.event.keyCode : event.keyCode;
		if (key == 13) dialog_okay(event);
	}

	///////////////////////////////////////////////////////////////////////////////
	//
	//  Draggable, resizeable, closeable window
	//
	////////////////////////////////////////////////////////////////////////////////

	// build a 2-column HTML table from an associative array (keys as text in
	// column 1, values in column 2).
	function build_table(a) {
		var tbl = document.createElement('table');

	    // build a row for each element in associative array
	    for (let i in a) {
	    	var label = document.createTextNode(window.parent.M.str.atto_circuit[i] + ': ');	//row labels are translated here
	    	var col1 = document.createElement('td');
	    	col1.appendChild(label);
	    	var col2 = document.createElement('td');
	    	col2.appendChild(a[i]);
	    	var row = document.createElement('tr');
	    	row.appendChild(col1);
	    	row.appendChild(col2);
	    	row.style.verticalAlign = 'center';
	    	tbl.appendChild(row);
	    }

	    return tbl;
	}

	function build_input(type,size,value) {
		var input = document.createElement('input');
		input.type = type;
		input.size = size;
		input.style.backgroundColor = element_style;
		input.style.color = normal_style;
	    input.className = 'property';  // make this easier to find later
	    if (value == undefined) input.value = '';
	    else input.value = value.toString();
	    return input;
	}

	// build a select widget using the strings found in the options array
	function build_select(options,selected) {
		var select = document.createElement('select');
		select.style.backgroundColor = element_style;
		select.style.color = normal_style;

		for (let i = 0; i < options.length; i++) {
			var option = document.createElement('option');
			option.value = options[i];			//value is the English field name in a dropdown list (if omitted, defaults to option.text)
			option.text = window.parent.M.str.atto_circuit[options[i]];		//text in a dropdown list are translated here
			select.add(option);
			if (options[i] == selected) select.selectedIndex = i;
		}
		return select;
	}

	Schematic.prototype.window = build_window;

	function build_window(title,content,offset,showDownloadIcon) {
	    // create the div for the top level of the window
	    var win = document.createElement('div');
	    win.sch = this;
	    win.content = content;
	    win.drag_x = undefined;
	    win.draw_y = undefined;

	    // div to hold the title
	    var head = document.createElement('div');
	    head.style.backgroundColor = element_style;
	    head.style.font = '10pt sans-serif';
	    head.style.color = normal_style; //'black';
	    head.style.fontWeight = 'bold';
	    head.style.textAlign = 'center';
	    head.style.padding = '5px';
	    head.style.borderBottom = '1px solid';
	    head.style.borderColor = border_style;
	    head.style.borderRadius = '4px 4px 0px 0px';
	    
	    // Add download icon to title bar of windows with graphs
	    if (showDownloadIcon) {
			var download_button = document.createElement("span");
			download_button.setAttribute('class', 'fas fa-fw fa-download fa-lg');
			download_button.style.color = icon_style;
		    download_button.style.cssFloat = 'left';
		    download_button.addEventListener('click',window_download_button,false);
		    download_button.win = win;
		    head.appendChild(download_button);
		}

	    head.appendChild(document.createTextNode(title));
	    head.win = win;
	    win.head = head;

		var close_button = document.createElement("span");
		close_button.setAttribute('class', 'fas fa-fw fa-times fa-lg');
		close_button.style.color = cancel_style;
	    close_button.style.cssFloat = 'right';
	    close_button.addEventListener('click',window_close_button,false);
	    close_button.win = win;
	    head.appendChild(close_button);
	    win.appendChild(head);

	    // capture mouse events in title bar
	    head.addEventListener('mousedown',window_mouse_down,false);

	    // div to hold the content
	    win.appendChild(content);
	    content.win = win;   // so content can contact us

	    // compute location relative to canvas
	    if (offset == undefined) offset = 0;
	    win.left = this.canvas.mouse_x + offset;
	    win.top = this.canvas.mouse_y + offset;

	    // add to DOM
	    win.style.background = element_style;
	    win.style.position = 'absolute';
	    win.style.left = win.left + 'px';
	    win.style.top = win.top + 'px';
	    win.style.border = '1px solid';
	    win.style.borderColor = border_style;
	    win.style.borderRadius = '4px';


	    this.canvas.parentNode.insertBefore(win,this.canvas);
	    bring_to_front(win,true);
	}

	// adjust zIndex of pop-up window so that it is in front
	function bring_to_front(win,insert) {
		var wlist = win.sch.window_list;
		var i = wlist.indexOf(win);

	    // remove from current position (if any) in window list
	    if (i != -1) wlist.splice(i,1);

	    // if requested, add to end of window list
	    if (insert) wlist.push(win);

	    // adjust all zIndex values
	    for (i = 0; i < wlist.length; i += 1)
	    	wlist[i].style.zIndex = 1000 + i;
	}

	// close the window
	function window_close(win) {
	    // remove the window from the top-level div of the schematic
	    win.parentNode.removeChild(win);

	    // remove from list of pop-up windows
	    bring_to_front(win,false);
	}

	function window_close_button(event) {
		if (!event) event = window.event;
		var src = event.target;
		window_close(src.win);
	}

	// download csv file with plot data
	function window_download_button(event) {
		if (!event) event = window.event;
		var src = event.target;
		var c = src.win.childNodes[1];	// canvas element

		// check if the horizontal scale is logarithmic
		var x_legend = c.x_legend;
		var logScale = (x_legend.substring(0, 3) == 'log');
		if (logScale) x_legend = x_legend.substring(4, x_legend.length - 1);
		
		// legends
		var csvStr = x_legend + ', ';		
		for (let j = 0; j < c.y_values.length; j++) {
			csvStr += c.y_legend + '_' + c.y_values[j][0] + ', ';
		}
		if (typeof c.z_values !== 'undefined') {
			for (let k = 0; k < c.z_values.length; k++) {
				csvStr += c.z_legend + '_' + c.z_values[k][0] +', ';
			}
		}
		csvStr += '\n';

		// data
		for (let i = 0; i < c.x_values.length; i++) {
			if (logScale) csvStr += Math.pow(10, c.x_values[i]) + ', '; // convert logHz to Hz
			else csvStr += c.x_values[i] + ', ';
			for (let j = 0; j < c.y_values.length; j++) {
				csvStr += c.y_values[j][2][i] + ', ';
			}
			if (typeof c.z_values !== 'undefined') {
				for (let k = 0; k < c.z_values.length; k++) {
					csvStr += c.z_values[k][2][i] + ', ';
				}
			}
			csvStr += '\n';
		}
		download(csvStr, "data.csv", "text/plain");
	}

	// capture mouse events in title bar of window
	function window_mouse_down(event) {
		if (!event) event = window.event;
		var src = event.target;
		var win = src.win;

		bring_to_front(win,true);

	    // add handlers to document so we capture them no matter what
	    document.addEventListener('mousemove',window_mouse_move,false);
	    document.addEventListener('mouseup',window_mouse_up,false);
	    document.tracking_window = win;

	    // remember where mouse is so we can compute dx,dy during drag
	    win.drag_x = event.pageX;
	    win.drag_y = event.pageY;

	    return false;
	}

	function window_mouse_up(event) {
		var win = document.tracking_window;

	    // show's over folks...
	    document.removeEventListener('mousemove',window_mouse_move,false);
	    document.removeEventListener('mouseup',window_mouse_up,false);
	    document.tracking_window = undefined;
	    win.drag_x = undefined;
	    win.drag_y = undefined;
	    return true;  // consume event
	}

	function window_mouse_move(event) {
		var win = document.tracking_window;

		if (win.drag_x) {
			var dx = event.pageX - win.drag_x;
			var dy = event.pageY - win.drag_y;

			// move the window
			win.left += dx;
			win.top += dy;
			win.style.left = win.left + 'px';
			win.style.top = win.top + 'px';

			// update reference point
			win.drag_x += dx;
			win.drag_y += dy;

			return true;  // consume event
		}
	}

	///////////////////////////////////////////////////////////////////////////////
	//
	//  Toolbar
	//
	////////////////////////////////////////////////////////////////////////////////

	Schematic.prototype.add_tool = function(icon,tip,callback) {
		var tool;
		if (icon.search('data:image') != -1) {
			tool = document.createElement('img');
			tool.src = icon;
		} else if (icon.search('fas fa-fw') != -1) {
			tool = document.createElement('span');
			tool.setAttribute('class', icon);
			tool.style.color = icon_style;
		}
		else {
			tool = document.createElement('span');
			//tool.style.font = 'small-caps sans-serif';
			tool.style.fontSize = 'large';
			tool.style.color = icon_style;
			var label = document.createTextNode(icon);
			tool.appendChild(label);
		}

	    // decorate tool
	    tool.style.borderWidth = '1px';
	    tool.style.borderStyle = 'solid';
	    tool.style.borderColor = background_style;
	    tool.style.padding = '8px 3px 8px 3px';
	    tool.style.verticalAlign = 'middle';
	    tool.style.cursor = 'default';

	    // set up event processing
	    tool.addEventListener('mouseover',tool_enter,false);
	    tool.addEventListener('mouseout',tool_leave,false);
	    tool.addEventListener('click',tool_click,false);

	    // add to toolbar
	    tool.sch = this;
	    tool.tip = tip;
	    tool.callback = callback;
	    this.toolbar.push(tool);

	    tool.enabled = false;
	    tool.style.opacity = 0.2;

	    return tool;
	};

	Schematic.prototype.enable_tool = function(tname,which) {
		var tool = this.tools[tname];

		if (tool != undefined) {
			tool.style.opacity = which ? 1.0 : 0.2;
			tool.enabled = which;

			// if disabling tool, remove border and tip
			if (!which) {
				tool.style.borderColor = background_style;
				tool.sch.message('');
			}
		}
	};

	// highlight tool button by turning on border, changing background
	function tool_enter(event) {
		if (!event) event = window.event;
		var tool = event.target;

		if (tool.enabled) {
			tool.style.borderColor = border_style;
			tool.sch.message(tool.tip);
			tool.opacity = 1.0;
		}
	}

	// unhighlight tool button by turning off border, reverting to normal background
	function tool_leave(event) {
		if (!event) event = window.event;
		var tool = event.target;

		if (tool.enabled) {
			tool.style.borderColor = background_style;
			tool.sch.message('');
		}
	}

	// handle click on a tool
	function tool_click(event) {
		if (!event) event = window.event;
		var tool = event.target;

		if (tool.enabled) {
			tool.sch.canvas.relMouseCoords(event);  // so we can position pop-up window correctly
			tool.callback.call(tool.sch);
		}
	}

	var help_icon   = 'fas fa-fw fa-question';
	var cut_icon    = 'fas fa-fw fa-cut fa-lg';
	var copy_icon   = 'fas fa-fw fa-copy fa-lg';
	var paste_icon  = 'fas fa-fw fa-paste fa-lg';
	var grid_icon	= 'fas fa-fw fa-border-all fa-lg';
	var delete_icon = 'fas fa-fw fa-times fa-lg';		
	var rotate_icon = 'fas fa-fw fa-redo';
	var save_icon   = 'fas fa-fw fa-save fa-lg';
	var exportasimage_icon   = 'fas fa-fw fa-save fa-lg';
	var open_icon   = 'fas fa-fw fa-folder-open fa-lg';
	var link_icon   = 'fas fa-fw fa-link fa-lg';

	///////////////////////////////////////////////////////////////////////////////
	//
	//  Graphing
	//
	///////////////////////////////////////////////////////////////////////////////

	// dashed lines from http://davidowens.wordpress.com/2010/09/07/html-5-canvas-and-dashed-lines/
	try {
		if (CanvasRenderingContext2D)
			CanvasRenderingContext2D.prototype.dashedLineTo = function(fromX, fromY, toX, toY, pattern) {
			    // Our growth rate for our line can be one of the following:
			    //   (+,+), (+,-), (-,+), (-,-)
			    // Because of this, our algorithm needs to understand if the x-coord and
			    // y-coord should be getting smaller or larger and properly cap the values
			    // based on (x,y).
			    var lt = function (a, b) { return a <= b; };
			    var gt = function (a, b) { return a >= b; };
			    var capmin = function (a, b) { return Math.min(a, b); };
			    var capmax = function (a, b) { return Math.max(a, b); };
			    var checkX = { thereYet: gt, cap: capmin };
			    var checkY = { thereYet: gt, cap: capmin };

			    if (fromY - toY > 0) {
			    	checkY.thereYet = lt;
			    	checkY.cap = capmax;
			    }
			    if (fromX - toX > 0) {
			    	checkX.thereYet = lt;
			    	checkX.cap = capmax;
			    }

			    this.moveTo(fromX, fromY);
			    var offsetX = fromX;
			    var offsetY = fromY;
			    var idx = 0, dash = true;
			    while (!(checkX.thereYet(offsetX, toX) && checkY.thereYet(offsetY, toY))) {
			    	var ang = Math.atan2(toY - fromY, toX - fromX);
			    	var len = pattern[idx];

			    	offsetX = checkX.cap(toX, offsetX + (Math.cos(ang) * len));
			    	offsetY = checkY.cap(toY, offsetY + (Math.sin(ang) * len));

			    	if (dash) this.lineTo(offsetX, offsetY);
			    	else this.moveTo(offsetX, offsetY);

			    	idx = (idx + 1) % pattern.length;
			    	dash = !dash;
			    }
			};
		}
	catch (err) { //noop
	}
	// given a range of values, return a new range [vmin',vmax'] where the limits
	// have been chosen "nicely".  Taken from matplotlib.ticker.LinearLocator
	function view_limits(vmin,vmax) {
	    // deal with degenerate case...
	    if (vmin == vmax) {
	    	if (vmin == 0) { vmin = -0.5; vmax = 0.5; }
	    	else {
	    		vmin = vmin > 0 ? 0.9*vmin : 1.1*vmin;
	    		vmax = vmax > 0 ? 1.1*vmax : 0.9*vmax;
	    	}
	    }

	    var log_range = Math.log(vmax - vmin)/Math.LN10;
	    var exponent = Math.floor(log_range);
	    //if (log_range - exponent < 0.5) exponent -= 1;
	    var scale = Math.pow(10,-exponent);
	    vmin = Math.floor(scale*vmin)/scale;
	    vmax = Math.ceil(scale*vmax)/scale;

	    return [vmin,vmax,1.0/scale];
	}

	function engineering_notation(n,nplaces,trim) {
		if (n == 0) return '0';
		if (Math.abs(n) < 1e-20) return '0';	//flatten tiny numbers to zero
		if (n == undefined) return 'undefined';
		if (trim == undefined) trim = true;

		var sign = n < 0 ? -1 : 1;
		var log10 = Math.log(sign*n)/Math.LN10;
	    var exp = Math.floor(log10/3);   // powers of 1000
	    var mantissa = sign*Math.pow(10,log10 - 3*exp);

	    // keep specified number of places following decimal point
	    var mstring = (mantissa + sign*0.5*Math.pow(10,-nplaces)).toString();
	    var mlen = mstring.length;
	    var endindex = mstring.indexOf('.');
	    if (endindex != -1) {
	    	if (nplaces > 0) {
	    		endindex += nplaces + 1;
	    		if (endindex > mlen) endindex = mlen;
	    		if (trim) {
	    			while (mstring.charAt(endindex-1) == '0') endindex -= 1;
	    			if (mstring.charAt(endindex-1) == '.') endindex -= 1;
	    		}
	    	}
	    	if (endindex < mlen)
	    		mstring = mstring.substring(0,endindex);
	    }

	    switch(exp) {
	    	case -5:	return mstring+"f";
	    	case -4:	return mstring+"p";
	    	case -3:	return mstring+"n";
	    	case -2:	return mstring+"u";
	    	case -1:	return mstring+"m";
	    	case 0:	return mstring;
	    	case 1:	return mstring+"k";
	    	case 2:	return mstring+"M";
	    	case 3:	return mstring+"G";
	    }

	    // don't have a good suffix, so just print the number
	    return n.toPrecision(4);

	}

	var grid_pattern = [1,2];
	var cursor_pattern = [5,5];

	// x_values is an array of x coordinates for each of the plots
	// y_values is an array of [color, value_array], one entry for each plot on left vertical axis
	// z_values is an array of [color, value_array], one entry for each plot on right vertical axis
	Schematic.prototype.graph = function(x_values,x_legend,y_values,y_legend,z_values,z_legend) {
	    var pwidth = 400;	// dimensions of actual plot
	    var pheight = 300;	// dimensions of actual plot
	    var left_margin = (y_values != undefined && y_values.length > 0) ? 65 : 25;
	    var top_margin = 25;
	    var right_margin = (z_values != undefined && z_values.length > 0) ? 65 : 25;
	    var bottom_margin = 45;
	    var tick_length = 5;

	    var w = pwidth + left_margin + right_margin;
	    var h = pheight + top_margin + bottom_margin;

	    var canvas = document.createElement('canvas');
	    canvas.width = w;
	    canvas.height = h;
	    canvas.style.display = 'block';		//gets rid of the little sliver of default padding at the bottom.


	    // the graph itself will be drawn here and this image will be copied
	    // onto canvas, where it can be overlayed with mouse cursors, etc.
	    var bg_image = document.createElement('canvas');
	    bg_image.width = w;
	    bg_image.height = h;
	    canvas.bg_image = bg_image;	// so we can find it during event handling

	    // start by painting an opaque background
	    var c = bg_image.getContext('2d');
	    c.fillStyle = background_style;
	    c.fillRect(0,0,w,h);
	    c.fillStyle = element_style;
	    c.fillRect(left_margin,top_margin,pwidth,pheight); 

	    // figure out scaling for plots
	    var x_min = array_min(x_values);
	    var x_max = array_max(x_values);
	    var x_limits = view_limits(x_min,x_max);
	    x_min = x_limits[0];
	    x_max = x_limits[1];
	    var x_scale = pwidth/(x_max - x_min);

	    function plot_x(x) {
	    	return (x - x_min)*x_scale + left_margin;
	    }

	    // draw x grid
	    c.strokeStyle = grid_style;
	    c.lineWidth = 1;
	    c.fillStyle = normal_style;
	    c.font = '10pt sans-serif';
	    c.textAlign = 'center';
	    c.textBaseline = 'top';
	    var end = top_margin + pheight;
	    for (let x = x_min; x <= x_max; x += x_limits[2]) {
			let temp = plot_x(x) + 0.5;  // keep lines crisp!

			// grid line
			c.beginPath();
			if (x == x_min) {
				c.moveTo(temp,top_margin);
				c.lineTo(temp,end);
			} else 
			c.dashedLineTo(temp,top_margin,temp,end,grid_pattern);
			c.stroke();

			// tick mark
			c.beginPath();
			c.moveTo(temp,end);
			c.lineTo(temp,end + tick_length);
			c.stroke();
			c.fillText(engineering_notation(x,2),temp,end + tick_length);
		}

		var y_min = Infinity;
		var y_max = -Infinity;
		var y_scale;
		if (y_values != undefined && y_values.length > 0) {
			//var plot;
			for (let plot = y_values.length - 1; plot >= 0; --plot) {
				let values = y_values[plot][2];
			    if (values == undefined) continue;  // no data points
			    let offset = y_values[plot][1];
			    let temp = array_min(values) + offset;
			    if (temp < y_min) y_min = temp;
			    temp = array_max(values) + offset;
			    if (temp > y_max) y_max = temp;
			}
			var y_limits = view_limits(y_min,y_max);
			y_min = y_limits[0];
			y_max = y_limits[1];
			y_scale = pheight/(y_max - y_min);

			function plot_y(y) {
				return (y_max - y)*y_scale + top_margin;
			}

			// draw y grid
			c.textAlign = 'right';
			c.textBaseline = 'middle';
			for (let y = y_min; y <= y_max; y += y_limits[2]) {
			    if (Math.abs(y/y_max) < 0.001) y = 0.0; // Just 3 digits
			    let temp = plot_y(y) + 0.5;  // keep lines crisp!

			    // grid line
			    c.beginPath();
			    if (y == y_min) {
			    	c.moveTo(left_margin,temp);
			    	c.lineTo(left_margin + pwidth,temp);
			    } else 
			    c.dashedLineTo(left_margin,temp,left_margin + pwidth,temp,grid_pattern);
			    c.stroke();

			    // tick mark
			    c.beginPath();
			    c.moveTo(left_margin - tick_length,temp);
			    c.lineTo(left_margin,temp);
			    c.stroke();
			    c.fillText(engineering_notation(y,2),left_margin - tick_length -2,temp);
			}

			// now draw each plot
			var x,y;
			var nx,ny;
			c.lineWidth = 3;
			c.lineCap = 'round';
			for (let plot = y_values.length - 1; plot >= 0; --plot) {
				let color = probe_colors_rgb[y_values[plot][0]];
			    if (color == undefined) continue;  // no plot color (== xaxis)
			    c.strokeStyle = color;
			    let values = y_values[plot][2];
			    if (values == undefined) continue;  // no data points
			    let offset = y_values[plot][1];

			    x = plot_x(x_values[0]);
			    y = plot_y(values[0] + offset);
			    c.beginPath();
			    c.moveTo(x,y);
			    for (let i = 1; i < x_values.length; i++) {
			    	nx = plot_x(x_values[i]);
			    	ny = plot_y(values[i] + offset);
			    	c.lineTo(nx,ny);
			    	x = nx;
			    	y = ny;
			    	if (i % 100 == 99) {
					    // too many lineTo's cause canvas to break
					    c.stroke();
					    c.beginPath();
					    c.moveTo(x,y);
					}
				}
				c.stroke();
			}
		}

		var z_min = Infinity;
		var z_max = -Infinity;
		var z_scale;
		if (z_values != undefined && z_values.length > 0) {
			for (let plot = z_values.length - 1; plot >= 0; --plot) {
				let values = z_values[plot][2];
			    if (values == undefined) continue;  // no data points
			    let offset = z_values[plot][1];
			    let temp = array_min(values) + offset;
			    if (temp < z_min) z_min = temp;
			    temp = array_max(values) + offset;
			    if (temp > z_max) z_max = temp;
			}
			var z_limits = view_limits(z_min,z_max);
			z_min = z_limits[0];
			z_max = z_limits[1];
			z_scale = pheight/(z_max - z_min);

			function plot_z(z) {
				return (z_max - z)*z_scale + top_margin;
			}

			// draw z ticks
			c.textAlign = 'left';
			c.textBaseline = 'middle';
			c.lineWidth = 1;
			c.strokeStyle = normal_style;
			var tick_length_half = Math.floor(tick_length/2);
			var tick_delta = tick_length - tick_length_half;
			for (let z = z_min; z <= z_max; z += z_limits[2]) {
			    if (Math.abs(z/z_max) < 0.001) z = 0.0; // Just 3 digits
			    let temp = plot_z(z) + 0.5;  // keep lines crisp!

			    // tick mark
			    c.beginPath();
			    c.moveTo(left_margin + pwidth - tick_length_half,temp);
			    c.lineTo(left_margin + pwidth + tick_delta,temp);
			    c.stroke();
			    c.fillText(engineering_notation(z,2),left_margin + pwidth + tick_length + 2,temp);
			}

			//var z;	//WMc z,nz initialized inside for loop
			//var nz;
			c.lineWidth = 3;
			for (let plot = z_values.length - 1; plot >= 0; --plot) {
				let color = probe_colors_rgb[z_values[plot][0]];
			    if (color == undefined) continue;  // no plot color (== xaxis)
			    c.strokeStyle = color;
			    let values = z_values[plot][2];
			    if (values == undefined) continue;  // no data points
			    let offset = z_values[plot][1];

			    let x = plot_x(x_values[0]);
			    let z = plot_z(values[0] + offset);
			    c.beginPath();
			    c.moveTo(x,z);
			    for (let i = 1; i < x_values.length; i++) {
			    	let nx = plot_x(x_values[i]);
			    	let nz = plot_z(values[i] + offset);
			    	c.lineTo(nx,nz);
			    	x = nx;
			    	z = nz;
			    	if (i % 100 == 99) {
					    // too many lineTo's cause canvas to break
					    c.stroke();
					    c.beginPath();
					    c.moveTo(x,z);
					}
				}
				c.stroke();
			}
		}

	    // draw legends
	    c.font = '12pt sans-serif';
	    c.textAlign = 'center';
	    c.textBaseline = 'bottom';
	    c.fillText(x_legend,left_margin + pwidth/2,h - 5);

	    if (y_values != undefined && y_values.length > 0) {
	    	c.textBaseline = 'top';
	    	c.save();
	    	c.translate(5 ,top_margin + pheight/2);
	    	c.rotate(-Math.PI/2);
	    	c.fillText(y_legend,0,0);
	    	c.restore();
	    }

	    if (z_values != undefined && z_values.length > 0) {
	    	c.textBaseline = 'bottom';
	    	c.save();
	    	c.translate(w-5 ,top_margin + pheight/2);
	    	c.rotate(-Math.PI/2);
	    	c.fillText(z_legend,0,0);
	    	c.restore();
	    }

	    // save info need for interactions with the graph
	    canvas.x_values = x_values;
	    canvas.y_values = y_values;
	    canvas.z_values = z_values;
	    canvas.x_legend = x_legend;
	    canvas.y_legend = y_legend;
	    canvas.z_legend = z_legend;
	    canvas.x_min = x_min;
	    canvas.x_scale = x_scale;
	    canvas.y_min = y_min;
	    canvas.y_scale = y_scale;
	    canvas.z_min = z_min;
	    canvas.z_scale = z_scale;
	    canvas.left_margin = left_margin;
	    canvas.top_margin = top_margin;
	    canvas.pwidth = pwidth;
	    canvas.pheight = pheight;
	    canvas.tick_length = tick_length;

	    canvas.cursor1_x = undefined;
	    canvas.cursor2_x = undefined;
	    canvas.sch = this;

	    // do something useful when user mouses over graph
	    canvas.addEventListener('mousemove',graph_mouse_move,false);

	    //console.log("x values" + x_values);		//x axis QQQ
	    //console.log("y values" + y_values);		//primary y-axis variables
	    //console.log("z values" + z_values);		//secondary y-axis variables

	    //var csvData = [x_values,y_values];
	    //console.log("all values" + csvData);		//all three axes

	    // return our masterpiece
	    redraw_plot(canvas);
	    return canvas;
	};

	function array_max(a) {
		var max = -Infinity;
		for (let i = a.length - 1; i >= 0; --i)
			if (a[i] > max) max = a[i];
		return max;
	}

	function array_min(a) {
		var min = Infinity;
		for (let i = a.length - 1; i >= 0; --i)
			if (a[i] < min) min = a[i];
		return min;
	}

	function plot_cursor(c,graph,cursor_x,left_margin) {
	    // draw dashed vertical marker that follows mouse
	    var x = graph.left_margin + cursor_x;
	    var end_y = graph.top_margin + graph.pheight + graph.tick_length;
	    c.strokeStyle = stroke_style;
	    c.lineWidth = 1;
	    c.beginPath();
	    c.dashedLineTo(x,graph.top_margin,x,end_y,cursor_pattern);
	    c.stroke();

	    // add x label at bottom of marker
	    var graph_x = cursor_x/graph.x_scale + graph.x_min;
	    c.font = '10pt sans-serif';
	    c.textAlign = 'center';
	    c.textBaseline = 'top';
	    c.fillStyle = background_style;
	    c.globalAlpha = 0.85;
	    c.fillText('\u2588\u2588\u2588\u2588\u2588',x,end_y);
	    c.globalAlpha = 1.0;
	    c.fillStyle = normal_style;
	    c.fillText(engineering_notation(graph_x,3,false),x,end_y);

	    // compute which points marker is between
	    var x_values = graph.x_values;
	    var len = x_values.length;
	    var index = 0;
	    while (index < len && graph_x >= x_values[index]) index += 1;
	    var x1 = (index == 0) ? x_values[0] : x_values[index-1];
	    var x2 = x_values[index];

	    if (x2 != undefined) {
			// for each plot, interpolate and output value at intersection with marker
			c.textAlign = 'left';
			var tx = graph.left_margin + left_margin;
			var ty = graph.top_margin + 3;
			if (graph.y_values != undefined) {
				for (let plot = 0; plot < graph.y_values.length; plot++) {
					let values = graph.y_values[plot][2];
					let color = probe_colors_rgb[graph.y_values[plot][0]];
					if (values == undefined || color == undefined) continue;  // no data points or xaxis

					// interpolate signal value at graph_x using values[index-1] and values[index]
					var y1 = (index == 0) ? values[0] : values[index-1];
					var y2 = values[index];
					var y = y1;
					if (graph_x != x1) y += (graph_x - x1)*(y2 - y1)/(x2 - x1);

					// annotate plot with value of signal at marker
					c.fillStyle = element_style;
					c.globalAlpha = 0.5;
					c.fillText('\u2588\u2588\u2588\u2588\u2588',tx-3,ty);
					c.globalAlpha = 1.0;
					c.fillStyle = color;
					c.fillText(engineering_notation(y,3,false),tx,ty);
					ty += 14;
				}
			}

			c.textAlign = 'right';
			if (graph.z_values != undefined) {
				tx = graph.left_margin + graph.pwidth - left_margin;
				ty = graph.top_margin + 3;
				for (let plot = 0; plot < graph.z_values.length; plot++) {
					let values = graph.z_values[plot][2];
					let color = probe_colors_rgb[graph.z_values[plot][0]];
					if (values == undefined || color == undefined) continue;  // no data points or xaxis

					// interpolate signal value at graph_x using values[index-1] and values[index]
					let z1 = (index == 0) ? values[0]: values[index-1];
					let z2 = values[index];
					let z = z1;
					if (graph_x != x1) z += (graph_x - x1)*(z2 - z1)/(x2 - x1);

					// annotate plot with value of signal at marker
					c.fillStyle = element_style;
					c.globalAlpha = 0.5;
					c.fillText('\u2588\u2588\u2588\u2588\u2588',tx+3,ty);
					c.globalAlpha = 1.0;
					c.fillStyle = color;
					c.fillText(engineering_notation(z,3,false),tx,ty);
					ty += 14;
				}
			}
		}
	}

	function redraw_plot(graph) {
		var c = graph.getContext('2d');
		c.drawImage(graph.bg_image,0,0);

		if (graph.cursor1_x != undefined) plot_cursor(c,graph,graph.cursor1_x,4);
		if (graph.cursor2_x != undefined) plot_cursor(c,graph,graph.cursor2_x,30);
	}

	function graph_mouse_move(event) {
		if (!event) event = window.event;
		var g = event.target;

		g.relMouseCoords(event);
	    // not sure yet where the 3,-3 offset correction comes from (borders? padding?)
	    var gx = g.mouse_x - g.left_margin - 3;
	    var gy = g.pheight - (g.mouse_y - g.top_margin) + 3;
	    if (gx >= 0 && gx <= g.pwidth && gy >=0 && gy <= g.pheight) {
			//g.sch.message('button: '+event.button+', which: '+event.which);
			g.cursor1_x = gx;
		} else {
			g.cursor1_x = undefined;
			g.cursor2_x = undefined;
		}

		redraw_plot(g);
	}

	///////////////////////////////////////////////////////////////////////////////
	//
	//  Parts bin
	//
	////////////////////////////////////////////////////////////////////////////////

	// one instance will be created for each part in the parts bin
	function Part(sch) {
		this.sch = sch;
		this.component = undefined;
		this.selected = false;

	    // set up canvas
	    this.canvas = document.createElement('canvas');
	    this.canvas.style.borderStyle = 'solid';
	    this.canvas.style.borderWidth = '1px';
	    this.canvas.style.borderColor = background_style;
	    //this.canvas.style.position = 'absolute';
	    this.canvas.style.cursor = 'default';
	    this.canvas.height = part_w;
	    this.canvas.width = part_h;
	    //this.canvas.part = this;
	    this.canvas.partw = this;	//WMc suspect canvas.part name collision in Chrome 74

	    this.canvas.addEventListener('mouseover',part_enter,false);
	    this.canvas.addEventListener('mouseout',part_leave,false);
	    this.canvas.addEventListener('mousedown',part_mouse_down,false);
	    this.canvas.addEventListener('mouseup',part_mouse_up,false);

	    this.canvas.addEventListener('touchstart',part_mouse_down,false);
	    this.canvas.addEventListener('touchend',part_mouse_up,false);

	    // make the part "clickable" by registering a dummy click handler
	    // this should make things work on the iPad
	    this.canvas.addEventListener('click',function(){},false);
	}

	Part.prototype.set_location = function(left,top) {
		this.canvas.style.left = left + 'px';
		this.canvas.style.top = top + 'px';
	};

	Part.prototype.right = function() {
		return this.canvas.offsetLeft + this.canvas.offsetWidth;
	};

	Part.prototype.bottom = function() {
		return this.canvas.offsetTop + this.canvas.offsetHeight;
	};

	Part.prototype.set_component = function(component,tip) {
		component.sch = this;
		this.component = component;
		this.tip = tip;

	    // figure out scaling and centering of parts icon
	    var b = component.bounding_box;
	    var dx = b[2] - b[0];
	    var dy = b[3] - b[1];
	    this.scale = 1.0; //Math.min(part_w/(1.2*dx),part_h/(1.2*dy));
	    this.origin_x = b[0] + dx/2.0 - part_w/(2.0*this.scale);
	    this.origin_y = b[1] + dy/2.0 - part_h/(2.0*this.scale);

	    this.redraw();
	};

	Part.prototype.redraw = function(part) {
		var c = this.canvas.getContext('2d');

	    // paint background color behind selected part in bin, 
	    // WMc: commmented out (background stays stuck on in mobile). Black border is sufficient.
	    //c.fillStyle = this.selected ? selected_style : background_style;
	    //c.fillRect(0,0,part_w,part_h);

	    if (this.component) this.component.draw(c);
	};

	Part.prototype.select = function(which) {
		this.selected = which;
		this.redraw();
	};

	Part.prototype.update_connection_point = function(cp,old_location) {
	    // no connection points in the parts bin
	};

	Part.prototype.moveTo = function(c,x,y) {
		c.moveTo((x - this.origin_x) * this.scale,(y - this.origin_y) * this.scale);
	};

	Part.prototype.lineTo = function(c,x,y) {
		c.lineTo((x - this.origin_x) * this.scale,(y - this.origin_y) * this.scale);
	};

	/*Part.prototype.BezierCurveTo = function(c,x,y, dx1,dy1,dx2, dy2) {
		var dx1 = this.dx1
		var dx2 = this.dx2
		var dy1 = this.dy1
		var dy2 = this.dy2
		c.curveTo(dx1,dy1, dx2, dy2, (x - this.origin_x) * this.scale,(y - this.origin_y) * this.scale);
	};*/

	Part.prototype.draw_line = function(c,x1,y1,x2,y2,width) {
		c.lineWidth = width*this.scale;
		c.beginPath();
		c.moveTo((x1 - this.origin_x) * this.scale,(y1 - this.origin_y) * this.scale);
		c.lineTo((x2 - this.origin_x) * this.scale,(y2 - this.origin_y) * this.scale);
		c.stroke();
	};

	Part.prototype.draw_arc = function(c,x,y,radius,start_radians,end_radians,anticlockwise,width,filled) {
		c.lineWidth = width*this.scale;
		c.beginPath();
		c.arc((x - this.origin_x)*this.scale,(y - this.origin_y)*this.scale,radius*this.scale,
			start_radians,end_radians,anticlockwise);
		if (filled) c.fill();
		else c.stroke();
	};

	Part.prototype.draw_text = function(c,text,x,y,size) {
		c.font = size*this.scale+'pt sans-serif';
		c.fillText(text,(x - this.origin_x) * this.scale,(y - this.origin_y) * this.scale);
	};

	function part_enter(event) {
		if (!event) event = window.event;
		var canvas = event.target;
		var part = canvas.partw;		//WMc

	    canvas.style.borderColor = border_style;
	    part.sch.message(part.tip+ '. ' +window.parent.M.str.atto_circuit.drag_onto_diagram);
	    //part.sch.message(part.tip);
	    return false;
	}

	function part_leave(event) {
		if (!event) event = window.event;
		var canvas = event.target;
		var part = canvas.partw;		//WMc

		if (typeof part.sch.new_part == 'undefined') {
		// leaving with no part selected?  revert handler
		//document.onselectstart = part.sch.saved_onselectstart;
		}

		canvas.style.borderColor = background_style;
		part.sch.message('');
		return false;
	}

	function part_mouse_down(event) {
		if (!event) event = window.event;
		var part = event.target.partw;		//WMc

		part.select(true);
		part.sch.new_part = part;
		return false;
	}

	function part_mouse_up(event) {
		if (!event) event = window.event;
		let part = event.target.partw;		//WMc

		    //part.select(false);					// commented out for touch 
		    //part.sch.new_part = undefined;		// for touch, place parts with touch-touch instead of drag
		    return false;							// on desktop, both drag and click-click work
		}

	////////////////////////////////////////////////////////////////////////////////
	//
	//  Rectangle helper functions
	//
	////////////////////////////////////////////////////////////////////////////////

	// rect is an array of the form [left,top,right,bottom]

	// ensure left < right, top < bottom
	function canonicalize(r) {
		var temp;

	    // canonicalize bounding box
	    if (r[0] > r[2]) {
	    	temp = r[0];
	    	r[0] = r[2];
	    	r[2] = temp;
	    }
	    if (r[1] > r[3]) {
	    	temp = r[1];
	    	r[1] = r[3];
	    	r[3] = temp;
	    }
	}

	function between(x,x1,x2) {
		return x1 <= x && x <= x2;
	}

	function inside(rect,x,y) {
		return between(x,rect[0],rect[2]) && between(y,rect[1],rect[3]);
	}

	// only works for manhattan rectangles
	function intersect(r1,r2) {
	    // look for non-intersection, negate result
	    var result =  !(r2[0] > r1[2] ||
				    	r2[2] < r1[0] ||
				    	r2[1] > r1[3] ||
				    	r2[3] < r1[1]);

	    // if I try to return the above expression, javascript returns undefined!!!
	    return result;
	}

	////////////////////////////////////////////////////////////////////////////////
	//
	//  Component base class
	//
	////////////////////////////////////////////////////////////////////////////////

	function Component(type,x,y,rotation) {
		this.sch = undefined;
		this.type = type;
		this.x = x;
		this.y = y;
		this.rotation = rotation;
		this.selected = false;
		this.properties = [];
	    this.bounding_box = [0,0,0,0];   // in device coords [left,top,right,bottom]
	    this.bbox = this.bounding_box;   // in absolute coords
	    this.connections = [];
	}

	Component.prototype.json = function(index) {
	    this.properties._json_ = index; // remember where we are in the JSON list

	    var props = {};
	    for (let p in this.properties) props[p] = this.properties[p];

	    	var conns = [];
	    for (let i = 0; i < this.connections.length; i++)
	    	conns.push(this.connections[i].json());

	    var json = [this.type,[this.x, this.y, this.rotation],props,conns];
	    return json;
	};

	Component.prototype.add_connection = function(offset_x,offset_y) {
		this.connections.push(new ConnectionPoint(this,offset_x,offset_y));
	};

	Component.prototype.remove_connection = function() 
		{ // remove connection points from schematic
		 for (let i = this.connections.length - 1; i >= 0; --i) {
	    	var cp = this.connections[i];
	    	this.sch.remove_connection_point(cp,cp.location);
	    }
		}
	Component.prototype.update_coords = function() {
		var x = this.x;
		var y = this.y;

	    // update bbox
	    var b = this.bounding_box;
	    this.bbox[0] = this.transform_x(b[0],b[1]) + x;
	    this.bbox[1] = this.transform_y(b[0],b[1]) + y;
	    this.bbox[2] = this.transform_x(b[2],b[3]) + x;
	    this.bbox[3] = this.transform_y(b[2],b[3]) + y;
	    canonicalize(this.bbox);

	    // update connections
	    for (let i = this.connections.length - 1; i >= 0; --i)
	    	this.connections[i].update_location();
	};

	Component.prototype.rotate = function(amount) {
		var old_rotation = this.rotation;
		this.rotation = (this.rotation + amount) % 8;
		this.update_coords();

	    // create an undoable edit record here
	    // using old_rotation
	};

	Component.prototype.move_begin = function() {
	    // remember where we started this move
	    this.move_x = this.x;
	    this.move_y = this.y;
	};

	Component.prototype.move = function(dx,dy) {
	    // update coordinates
	    this.x += dx;
	    this.y += dy;
	    this.update_coords();
	};

	Component.prototype.move_end = function() {
		var dx = this.x - this.move_x;
		var dy = this.y - this.move_y;

		if (dx != 0 || dy != 0) {
			// create an undoable edit record here

			this.sch.check_wires(this);
		}
	};

	Component.prototype.add = function(sch) {
	    this.sch = sch;   // we now belong to a schematic!
	    sch.add_component(this);
	    this.update_coords();
	};

	Component.prototype.remove = function() {
	    // remove connection points from schematic
	    for (let i = this.connections.length - 1; i >= 0; --i) {
	    	var cp = this.connections[i];
	    	this.sch.remove_connection_point(cp,cp.location);
	    }

	    // remove component from schematic
	    this.sch.remove_component(this);
	    this.sch = undefined;

	    // create an undoable edit record here
	};

	Component.prototype.transform_x = function(x,y) {
		var rot = this.rotation;
		if (rot == 0 || rot == 6) return x;
		else if (rot == 1 || rot == 5) return -y;
		else if (rot == 2 || rot == 4) return -x;
		else return y;
	};

	Component.prototype.transform_y = function(x,y) {
		var rot = this.rotation;
		if (rot == 1 || rot == 7) return x;
		else if (rot == 2 || rot == 6) return -y;
		else if (rot == 3 || rot == 5) return -x;
		else return y;
	};

	Component.prototype.moveTo = function(c,x,y) {
		var nx = this.transform_x(x,y) + this.x;
		var ny = this.transform_y(x,y) + this.y;
		this.sch.moveTo(c,nx,ny);
	};

	Component.prototype.lineTo = function(c,x,y) {
		var nx = this.transform_x(x,y) + this.x;
		var ny = this.transform_y(x,y) + this.y;
		this.sch.lineTo(c,nx,ny);
	};

	Component.prototype.draw_line = function(c,x1,y1,x2,y2) {
		c.strokeStyle = this.selected ? selected_style :normal_style;
		/*c.strokeStyle = this.selected ? selected_style :
		this.type == 'w' ? normal_style : component_style;*/
		var nx1 = this.transform_x(x1,y1) + this.x;
		var ny1 = this.transform_y(x1,y1) + this.y;
		var nx2 = this.transform_x(x2,y2) + this.x;
		var ny2 = this.transform_y(x2,y2) + this.y;
		this.sch.draw_line(c,nx1,ny1,nx2,ny2,1);
	};

	Component.prototype.draw_circle = function(c,x,y,radius,filled) {
		//c.strokeStyle =  normal_style;
		if (filled) c.fillStyle = this.selected ? selected_style : normal_style;
		else c.strokeStyle = this.selected ? selected_style :normal_style;
			/*this.type == 'w' ? normal_style : component_style;*/
		var nx = this.transform_x(x,y) + this.x;
		var ny = this.transform_y(x,y) + this.y;

		this.sch.draw_arc(c,nx,ny,radius,0,2*Math.PI,false,1,filled);
	};

	var rot_angle = [
	     0.0,		// NORTH (identity)
	     Math.PI/2,	// EAST (rot270)
	     Math.PI,	// SOUTH (rot180)
	     3*Math.PI/2,  // WEST (rot90)
	     0.0,		// RNORTH (negy)
	     Math.PI/2,	// REAST (int-neg)
	     Math.PI,	// RSOUTH (negx)
	     3*Math.PI/2,	// RWEST (int-pos)
	     ];

     Component.prototype.draw_arc = function(c,x,y,radius,start_radians,end_radians) {
     	c.strokeStyle = this.selected ? selected_style :
     	this.type == 'w' ? normal_style : normal_style;
     	var nx = this.transform_x(x,y) + this.x;
     	var ny = this.transform_y(x,y) + this.y;
     	this.sch.draw_arc(c,nx,ny,radius,
     		start_radians+rot_angle[this.rotation],end_radians+rot_angle[this.rotation],
     		false,1,false);
     };

	Component.prototype.draw = function(c) {
	    /* for debug: puts X on connection points
	    for (let i = this.connections.length - 1; i >= 0; --i) {
		var cp = this.connections[i];
		cp.draw_x(c);
	    }*/
	    
	};

	// result of rotating an alignment [rot*9 + align]
	var aOrient = [
	   0, 1, 2, 3, 4, 5, 6, 7, 8,		// NORTH (identity)
	   2, 5, 8, 1, 4, 7, 0, 3, 6, 		// EAST (rot270)
	   8, 7, 6, 5, 4, 3, 2, 1, 0,		// SOUTH (rot180)
	   6, 3, 0, 7, 4, 1, 8, 5, 3,		// WEST (rot90)
	   2, 1, 0, 5, 4, 3, 8, 7, 6,		// RNORTH (negy)
	   8, 5, 2, 7, 4, 1, 6, 3, 0, 		// REAST (int-neg)
	   6, 7, 8, 3, 4, 5, 0, 1, 2,		// RSOUTH (negx)
	   0, 3, 6, 1, 4, 7, 2, 5, 8		// RWEST (int-pos)
	   ];

	var textAlign = [
	'left', 'center', 'right',
	'left', 'center', 'right',
	'left', 'center', 'right'
	];

	var textBaseline = [
	'top', 'top', 'top',
	'middle', 'middle', 'middle',
	'bottom', 'bottom', 'bottom'
	];

	Component.prototype.draw_text = function(c,text,x,y,alignment,size,fill) {
		var a = aOrient[this.rotation*9 + alignment];
		c.textAlign = textAlign[a];
		c.textBaseline = textBaseline[a];
		//c.fillStyle =  normal_style;
		if (fill == undefined)
			c.fillStyle = this.selected ? selected_style : normal_style;
		else
			c.fillStyle = normal_style;
		this.sch.draw_text(c,text,
			this.transform_x(x,y) + this.x,
			this.transform_y(x,y) + this.y,
			size);
	};

	Component.prototype.set_select = function(which) {
		if (which != this.selected) {
			this.selected = which;
		// create an undoable edit record here
		}
	};

	Component.prototype.select = function(x,y,shiftKey) {
		this.was_previously_selected = this.selected;
		if (this.near(x,y)) {
			this.set_select(shiftKey ? !this.selected : true);
			return true;
		} else return false;
	};

	Component.prototype.select_rect = function(s) {
		this.was_previously_selected = this.selected;
		if (intersect(this.bbox,s))
			this.set_select(true);
	};

	// if connection point of component c bisects the
	// wire represented by this compononent, return that
	// connection point.  Otherwise return null.
	Component.prototype.bisect = function(c) {
		return null;
	};

	// does mouse click fall on this component?
	Component.prototype.near = function(x,y) {
		return inside(this.bbox,x,y);
	};

	Component.prototype.edit_properties = function(x,y) {
		if (this.near(x,y)) {
		// make an <input> widget for each property
		var fields = [];
		for (let i in this.properties)
		    // underscore at beginning of property name => system property
		if (i.charAt(0) != '_')
			fields[i] = build_input('text',10,this.properties[i]);

		var content = build_table(fields);
		content.fields = fields;
		content.component = this;

		this.sch.dialog(window.parent.M.str.atto_circuit.edit_properties,content,function(content) {
			for (let i in content.fields)
				content.component.properties[i] = content.fields[i].value;
			content.component.sch.redraw_background();
		});
		return true;
		} else return false;
	};

	Component.prototype.clear_labels = function() {
		for (let i = this.connections.length - 1; i >=0; --i) {
			this.connections[i].clear_label();
		}
	};

	// default action: don't propagate label
	Component.prototype.propagate_label = function(label) {
	};

	// give components a chance to generate default labels for their connection(s)
	// default action: do nothing
	Component.prototype.add_default_labels = function() {
	};

	// component should generate labels for all unlabeled connections
	Component.prototype.label_connections = function() {
		for (let i = this.connections.length - 1; i >=0; --i) {
			var cp = this.connections[i];
			if (!cp.label)
				cp.propagate_label(this.sch.get_next_label());
		}
	};

	// default behavior: no probe info
	Component.prototype.probe_info = function() { return undefined; };

	// default behavior: nothing to display for DC analysis
	Component.prototype.display_current = function(c,vmap) {
	};

	////////////////////////////////////////////////////////////////////////////////
	//
	//  Connection point
	//
	////////////////////////////////////////////////////////////////////////////////

	var connection_point_radius = 2;

	function ConnectionPoint(parent,x,y) {
		this.parent = parent;
		this.offset_x = x;
		this.offset_y = y;
		this.location = '';
		this.update_location();
		this.label = undefined;
	}

	ConnectionPoint.prototype.toString = function() {
		return '<ConnectionPoint ('+this.offset_x+','+this.offset_y+') '+this.parent.toString()+'>';
	};

	ConnectionPoint.prototype.json = function() {
		return this.label;
	};

	ConnectionPoint.prototype.clear_label = function() {
		this.label = undefined;
	};

	ConnectionPoint.prototype.propagate_label = function(label) {
	    // should we check if existing label is the same?  it should be...

	    if (this.label === undefined) {
			// label this connection point
			this.label = label;

			// propagate label to coincident connection points
			this.parent.sch.propagate_label(label,this.location);

			// possibly label other cp's for this device?
			this.parent.propagate_label(label);
		} else if (this.label != '0' && label != '0' && this.label != label)
			alert(window.parent.M.str.atto_circuit.node_has_two_conflicting_labels+this.label+', '+label);
	};

	ConnectionPoint.prototype.update_location = function() {
	    // update location string which we use as a key to find coincident connection points
	    var old_location = this.location;
	    var parent = this.parent;
	    var nx = parent.transform_x(this.offset_x,this.offset_y) + parent.x;
	    var ny = parent.transform_y(this.offset_x,this.offset_y) + parent.y;
	    this.x = nx;
	    this.y = ny;
	    this.location = nx + ',' + ny;

	    // add ourselves to the connection list for the new location
	    if (parent.sch) 
	    	parent.sch.update_connection_point(this,old_location);
	};

	ConnectionPoint.prototype.coincident = function(x,y) {
		return this.x==x && this.y==y;
	};

	ConnectionPoint.prototype.draw = function(c,n) {
		if (n != 2)
			this.parent.draw_circle(c,this.offset_x,this.offset_y,connection_point_radius,n > 2);
	};

	ConnectionPoint.prototype.draw_x = function(c) {
		this.parent.draw_line(c,this.offset_x-2,this.offset_y-2,this.offset_x+2,this.offset_y+2);
		this.parent.draw_line(c,this.offset_x+2,this.offset_y-2,this.offset_x-2,this.offset_y+2);
	};

	ConnectionPoint.prototype.display_voltage = function(c,vmap) {
		let v = vmap[this.label];
		if (v != undefined) {
			var label = v.toFixed(2) + 'V';

			// first draw some solid blocks in the background
			c.globalAlpha = 0.85;
			this.parent.draw_text(c,'\u2588\u2588\u2588',this.offset_x,this.offset_y,
				4,annotation_size,element_style);
			c.globalAlpha = 1.0;

			// display the node voltage at this connection point
			this.parent.draw_text(c,label,this.offset_x,this.offset_y,
				4,annotation_size,annotation_style);

			// only display each node voltage once
			delete vmap[this.label];
		}
	};

	// see if three connection points are collinear
	function collinear(p1,p2,p3) {
	    // from http://mathworld.wolfram.com/Collinear.html
	    var area = p1.x*(p2.y - p3.y) + p2.x*(p3.y - p1.y) + p3.x*(p1.y - p2.y);
	    return area == 0;
	}

	////////////////////////////////////////////////////////////////////////////////
	//
	//  Wire
	//
	////////////////////////////////////////////////////////////////////////////////

	var near_distance = 2;   // how close to wire counts as "near by"

	function Wire(x1,y1,x2,y2) {
	    // arbitrarily call x1,y1 the origin
	    Component.call(this,'w',x1,y1,0);
	    this.dx = x2 - x1;
	    this.dy = y2 - y1;
	    this.add_connection(0,0);
	    this.add_connection(this.dx,this.dy);

	    // compute bounding box (expanded slightly)
	    var r = [0,0,this.dx,this.dy];
	    canonicalize(r);
	    r[0] -= near_distance;
	    r[1] -= near_distance;
	    r[2] += near_distance;
	    r[3] += near_distance;
	    this.bounding_box = r;
	    this.update_coords();    // update bbox

	    // used in selection calculations
	    this.len = Math.sqrt(this.dx*this.dx + this.dy*this.dy);
	}
	Wire.prototype = new Component();
	Wire.prototype.constructor = Wire;

	Wire.prototype.toString = function() {
		return '<Wire ('+this.x+','+this.y+') ('+(this.x+this.dx)+','+(this.y+this.dy)+')>';
	};

	// return connection point at other end of wire from specified cp
	Wire.prototype.other_end = function(cp) {
		if (cp == this.connections[0]) return this.connections[1];
		else if (cp == this.connections[1]) return this.connections[0];
		else return undefined;
	};

	Wire.prototype.json = function(index) {
		var json = ['w',[this.x, this.y, this.x+this.dx, this.y+this.dy]];
		return json;
	};

	Wire.prototype.draw = function(c) {
		this.draw_line(c,0,0,this.dx,this.dy);
	};

	Wire.prototype.clone = function(x,y) {
		return new Wire(x,y,x+this.dx,y+this.dy);
	};

	Wire.prototype.near = function(x,y) {
	    // crude check: (x,y) within expanded bounding box of wire
	    if (inside(this.bbox,x,y)) {
			// compute distance between x,y and nearst point on line
			// http://www.allegro.cc/forums/thread/589720
			let D = Math.abs((x - this.x)*this.dy - (y - this.y)*this.dx)/this.len;
			if (D <= near_distance) return true;
		}
		return false;
	};

	// selection rectangle selects wire only if it includes
	// one of the end points
	Wire.prototype.select_rect = function(s) {
		this.was_previously_selected = this.selected;
		if (inside(s,this.x,this.y) || inside(s,this.x+this.dx,this.y+this.dy))
			this.set_select(true);
	};

	// if connection point cp bisects the
	// wire represented by this compononent, return true
	Wire.prototype.bisect_cp = function(cp) {
		var x = cp.x;
		var y = cp.y;

	    // crude check: (x,y) within expanded bounding box of wire
	    if (inside(this.bbox,x,y)) {
			// compute distance between x,y and nearst point on line
			// http://www.allegro.cc/forums/thread/589720
			let D = Math.abs((x - this.x)*this.dy - (y - this.y)*this.dx)/this.len;
			// final check: ensure point isn't an end point of the wire
			if (D < 1 && !this.connections[0].coincident(x,y) && !this.connections[1].coincident(x,y))
				return true;
		}
		return false;
	};

	// if some connection point of component c bisects the
	// wire represented by this compononent, return that
	// connection point.  Otherwise return null.
	Wire.prototype.bisect = function(c) {
		if (c == undefined) return;
		for (let i = c.connections.length - 1; i >= 0; --i) {
			var cp = c.connections[i];
			if (this.bisect_cp(cp)) return cp;
		}
		return null;
	};

	Wire.prototype.move_end = function() {
	    // look for wires bisected by this wire
	    this.sch.check_wires(this);

	    // look for connection points that might bisect us
	    this.sch.check_connection_points(this);
	};

	// wires "conduct" their label to the other end
	Wire.prototype.propagate_label = function(label) {
	    // don't worry about relabeling a cp, it won't recurse!
	    this.connections[0].propagate_label(label);
	    this.connections[1].propagate_label(label);
	};

	// Wires have no properties to edit
	Wire.prototype.edit_properties = function(x,y) {
		return false;
	};

	// some actual component will start the labeling of electrical nodes,
	// so do nothing here
	Wire.prototype.label_connections = function() {
	};

	////////////////////////////////////////////////////////////////////////////////
	//
	//  Ground
	//
	////////////////////////////////////////////////////////////////////////////////

	function Ground(x,y,rotation) {
		Component.call(this,'g',x,y,rotation);
		this.add_connection(0,0);
		this.bounding_box = [-6,0,6,14];
		this.update_coords();
	}
	Ground.prototype = new Component();
	Ground.prototype.constructor = Ground;

	Ground.prototype.toString = function() {
		return '<Ground ('+this.x+','+this.y+')>';
	};

	Ground.prototype.draw = function(c) {
	    Component.prototype.draw.call(this,c);   // give superclass a shot
	    this.draw_line(c,0,0,0,8);
	    this.draw_line(c,-6,8,6,8);
	    this.draw_line(c,-6,8,0,14);
	    this.draw_line(c,0,14,6,8);
	};

	Ground.prototype.clone = function(x,y) {
		return new Ground(x,y,this.rotation);
	};

	// Grounds no properties to edit
	Ground.prototype.edit_properties = function(x,y) {
		return false;
	};

	// give components a chance to generate a label for their connection(s)
	// default action: do nothing
	Ground.prototype.add_default_labels = function() {
	    this.connections[0].propagate_label('0');   // canonical label for GND node
	};

	////////////////////////////////////////////////////////////////////////////////
	//
	//  Label
	//
	////////////////////////////////////////////////////////////////////////////////

	function Label(x,y,rotation,label) {
		Component.call(this,'L',x,y,rotation);
		this.properties.label = label ? label : '???';
		this.add_connection(0,0);
		this.bounding_box = [0,-4,16,4];	// Larger bounding box to ease selection. WMc
		this.update_coords();
	}
	Label.prototype = new Component();
	Label.prototype.constructor = Label;

	Label.prototype.toString = function() {
		return '<Label'+' ('+this.x+','+this.y+')>';
	};

	Label.prototype.draw = function(c) {
	    Component.prototype.draw.call(this,c);   // give superclass a shot
	    this.draw_line(c,0,0,8,0);
	    //this.draw_line(c,0,-4,16,4);			// debug, corners of bounding box WMc
	    this.draw_text(c,this.properties.label,9,0,3,property_size);
	};

	Label.prototype.clone = function(x,y) {
		return new Label(x,y,this.rotation,this.properties.label);
	};

	// give components a chance to generate a label for their connection(s)
	// default action: do nothing
	Label.prototype.add_default_labels = function() {
		this.connections[0].propagate_label(this.properties.label);
	};

	////////////////////////////////////////////////////////////////////////////////
	//
	//  Voltage Probe
	//
	////////////////////////////////////////////////////////////////////////////////

	var probe_colors = ['red','green','blue','cyan','magenta','orange','black','xaxis'];
	// var probe_cnames = window.parent.M.str.atto_circuit_probe_cnames;	// color names, see window.parent.M.str.atto_circuit string file, en-US.js, etc.

	var probe_colors_rgb = {
		'red': 'rgb(232,77,57)',
		'green': 'rgb(31,171,84)',
		'blue': 'rgb(35,110,201)',
		'cyan': 'rgb(99,217,234)',
		'magenta': 'rgb(237,95,166)',
	  	'yellow': 'rgb(244,211,69)',
		'orange': 'rgb(255,156,57)',
		'black': 'rgb(0,0,0)',
		'xaxis': undefined
	};

	function Probe(x,y,rotation,color,offset) {
		Component.call(this,'s',x,y,rotation);
		this.add_connection(0,0);
		this.properties.color = color ? color : 'cyan';
		this.properties.offset = (offset==undefined || offset=='') ? '0' : offset;
		this.bounding_box = [0,0,27,-21];
		this.update_coords();
	}
	Probe.prototype = new Component();
	Probe.prototype.constructor = Probe;

	Probe.prototype.toString = function() {
		return '<Probe ('+this.x+','+this.y+')>';
	};

	Probe.prototype.draw = function(c) {
	    // draw outline
	    this.draw_line(c,0,0,4,-4);
	    this.draw_line(c,2,-6,6,-2);
	    this.draw_line(c,2,-6,17,-21);
	    this.draw_line(c,6,-2,21,-17);
	    this.draw_line(c,17,-21,21,-17);
	    this.draw_arc(c,19,-11,8,3*Math.PI/2,0);

	    // fill body with plot color
	    var color = probe_colors_rgb[this.properties.color];
	    if (color != undefined) {
	    	c.fillStyle = color;
	    	c.beginPath();
	    	this.moveTo(c,2,-6);
	    	this.lineTo(c,6,-2);
	    	this.lineTo(c,21,-17);
	    	this.lineTo(c,17,-21);
	    	this.lineTo(c,2,-6);
	    	c.fill();
	    } else {
	    	this.draw_text(c,this.properties.color,27,-11,1,property_size);
	    }
	};

	Probe.prototype.clone = function(x,y) {
		return new Probe(x,y,this.rotation,this.properties.color,this.properties.offset);
	};

	Probe.prototype.edit_properties = function(x,y) {
		if (inside(this.bbox,x,y)) {
			var fields = [];
			var n = probe_colors.indexOf(this.properties.color);
			//fields.Plot_color = build_select(probe_cnames,probe_cnames[n]);
			fields.Plot_color = build_select(probe_colors,probe_colors[n]);
			fields.Plot_offset = build_input('text',10,this.properties.offset);

			var content = build_table(fields);
			content.fields = fields;
			content.component = this;

			this.sch.dialog(window.parent.M.str.atto_circuit.edit_properties,content,function(content) {
				var color_choice = content.fields.Plot_color;
				content.component.properties.color = probe_colors[color_choice.selectedIndex];
				content.component.properties.offset = content.fields.Plot_offset.value;
				content.component.sch.redraw_background();
			});
			return true;
		} else return false;
	};

	// return [color, node_label, offset, type] for this probe
	Probe.prototype.probe_info = function() {
		var color = this.properties.color;
		var offset = this.properties.offset;
		if (offset==undefined || offset=="") offset = '0';
		return [color,this.connections[0].label,offset,'voltage'];
	};

	////////////////////////////////////////////////////////////////////////////////
	//
	//  Ammeter Probe
	//
	////////////////////////////////////////////////////////////////////////////////

	function Ammeter(x,y,rotation,color,offset) {
		Component.call(this,'a',x,y,rotation);
	    this.add_connection(0,0);   // pos
	    this.add_connection(16,0);   // neg
	    this.properties.color = color ? color : 'magenta';
	    this.properties.offset = (offset==undefined || offset=='') ? '0' : offset;
	    this.bounding_box = [-3,0,16,3];
	    this.update_coords();
	}
	Ammeter.prototype = new Component();
	Ammeter.prototype.constructor = Ammeter;

	Ammeter.prototype.toString = function() {
		return '<Ammeter ('+this.x+','+this.y+')>';
	};

	Ammeter.prototype.move_end = function() {
	    Component.prototype.move_end.call(this);   // do the normal processing

	    // special for current probes: see if probe has been placed
	    // in the middle of wire, creating three wire segments one
	    // of which is shorting the two terminals of the probe.  If
	    // so, auto remove the shorting segment.
	    var e1 = this.connections[0].location;
	    var e2 = this.connections[1].location;
	    var cplist = this.sch.find_connections(this.connections[0]);
	    for (let i = cplist.length - 1; i >= 0; --i) {
			var c = cplist[i].parent;  // a component connected to ammeter terminal
			// look for a wire whose end points match those of the ammeter
			if (c.type == 'w') {
				var c_e1 = c.connections[0].location;
				var c_e2 = c.connections[1].location;
				if ((e1 == c_e1 && e2 == c_e2) || (e1 == c_e2 && e2 == c_e1)) {
					c.remove();
					break;
				}
			}
		}
	};

	Ammeter.prototype.draw = function(c) {
		this.draw_line(c,0,0,16,0);

	    // draw chevron in probe color
	    c.strokeStyle = probe_colors_rgb[this.properties.color];
	    if (c.strokeStyle != undefined) {
	    	c.beginPath();
	    	this.moveTo(c,6,-3);
	    	this.lineTo(c,10,0);
	    	this.lineTo(c,6,3);
	    	c.stroke();
	    }
	};

	Ammeter.prototype.clone = function(x,y) {
		return new Ammeter(x,y,this.rotation,this.properties.color,this.properties.offset);
	};

	// share code with voltage probe
	Ammeter.prototype.edit_properties = Probe.prototype.edit_properties;

	Ammeter.prototype.label = function() {
		var name = this.properties.name;
		var label = 'I(' + (name ? name : '_' + this.properties._json_) + ')';
		return label;
	};

	// display current for DC analysis
	Ammeter.prototype.display_current = function(c,vmap) {
		let label = this.label();
		let v = vmap[label];
		if (v != undefined) {
			let i = engineering_notation(v,2) + 'A';
			this.draw_text(c,i,8,-5,7,annotation_size,annotation_style);

			// only display each current once
			delete vmap[label];
		}
	};

	// return [color, current_label, offset, type] for this probe
	Ammeter.prototype.probe_info = function() {
		let color = this.properties.color;
		let offset = this.properties.offset;
		if (offset==undefined || offset=="") offset = '0';
		return [color,this.label(),offset,'current'];
	};


	////////////////////////////////////////////////////////////////////////////////
	//
	//  mesure
	//
	////////////////////////////////////////////////////////////////////////////////
	/*const mesurerecit = require("mesure.js").default;
	//	import mesurerecit  from './mesure.js';
	////////////////////////////////////////////////////////////////////////////////
	//
	//  mesure
	//
	////////////////////////////////////////////////////////////////////////////////
	/*const mesurerecit = require("mesure.js").default;
	//	import mesurerecit  from './mesure.js';
	mesurerecit()*/
	var Mesure_types = ['amperemetre','voltmetre', 'ohmmetre'];
  
		function mesure(x,y,rotation,name,vm,type) {
		Component.call(this,'vm',x,y,rotation);
		this.properties.name = name;
		//this.properties.r = r ? r : '1';
		this.add_connection(0,-24);
		this.add_connection(0,24);
		this.properties.type = type ? type : 'amperemetre';
		this.bounding_box = [-12,-24,12,24];
		this.update_coords();
	}
	mesure.prototype = new Component();
	mesure.prototype.constructor = mesure;

	mesure.prototype.toString = function() {
		return '<mesure '+this.properties.vm+' ('+this.x+','+this.y+')>';
	};

	mesure.prototype.draw = function(c) {
		Component.prototype.draw.call(this,c); 
		
		  // give superclass a shot
		this.draw_line(c,0,-24,0,-12);
	    this.draw_circle(c,0,0,12,false);
		this.draw_line(c,0,12,0,24);
		if (this.properties.type == 'voltmetre') {
			// put a box around an ideal diode
			this.draw_text(c,"V",0,0,4,14, false);
		}
		else if (this.properties.type == 'amperemetre'){
			this.draw_text(c,"A",0,0,4,14, false);
		}
		else if (this.properties.type == 'ohmmetre'){
			this.draw_text(c,"\u03A9",0,0,4,14, false);
		}
			else{
				this.draw_text(c,"\u03A9",0,0,4,14, false);
			}
	   
	   
	    if (this.properties.name)
	    	this.draw_text(c,this.properties.name,12,12,6,property_size);
	};
	mesure.prototype.edit_properties = function(x,y) {
		if (inside(this.bbox,x,y)) {
			var fields = [];
			fields.name = build_input('text',10,this.properties.name);
						fields.type = build_select(Mesure_types,this.properties.type);

			var content = build_table(fields);
			content.fields = fields;
			content.component = this;

			this.sch.dialog(window.parent.M.str.atto_circuit.edit_properties,content,function(content) {
				content.component.properties.name = content.fields.name.value;
				content.component.properties.type = Mesure_types[content.fields.type.selectedIndex];
				content.component.sch.redraw_background();
			});
			return true;
		} else return false;
	};
	mesure.prototype.clone = function(x,y) {
		return new mesure(x,y,this.rotation,this.properties.name,this.properties.vm);
	};

	////////////////////////////////////////////////////////////////////////////////
	//
	//  Ampoule
	//
	////////////////////////////////////////////////////////////////////////////////
	
  
	function ampoule(x,y,rotation,name,am) {
		Component.call(this,'am',x,y,rotation);
		this.properties.name = name ? name :'L1';
		this.add_connection(0,-24);
		this.add_connection(0,24);
		this.bounding_box = [-7,-24,31,24];
		this.update_coords();
	}
	ampoule.prototype = new Component();
	ampoule.prototype.constructor = ampoule;

	ampoule.prototype.toString = function() {
		return '<ampoule '+this.properties.vm+' ('+this.x+','+this.y+')>';
	};

	ampoule.prototype.draw = function(c) {
		Component.prototype.draw.call(this,c); 
		
		  
		this.draw_line(c,0,-24,0,-5);
		this.draw_line(c,0,-5,5,-5);
		this.draw_circle(c,5,0,12,false);
		this.draw_arc(c,5,-2,3,6*Math.PI/4,2*Math.PI/4);
		this.draw_arc(c,5,2,3,6*Math.PI/4,2*Math.PI/4);
		this.draw_arc(c,7,0,2,3*Math.PI/4,-3*Math.PI/4);
		this.draw_line(c,0,5,0,24);
		this.draw_line(c,0,5,5,5);
		
	   
	    if (this.properties.name)
	    	this.draw_text(c,this.properties.name,16,18,6,property_size);
	};
	
	
	ampoule.prototype.clone = function(x,y) {
		return new ampoule(x,y,this.rotation,this.properties.name,this.properties.vm);
	};

	////////////////////////////////////////////////////////////////////////////////
	//
	//  Speaker
	//
	////////////////////////////////////////////////////////////////////////////////
	
  
	function speaker(x,y,rotation,name,am) {
		Component.call(this,'sp',x,y,rotation);
		this.properties.name = name ? name :'HP';
		this.add_connection(0,-24);
		this.add_connection(0,24);
		this.bounding_box = [-12,-24,12,24];
		this.update_coords();
	}
	speaker.prototype = new Component();
	speaker.prototype.constructor = speaker;

	speaker.prototype.toString = function() {
		return '<speaker '+this.properties.vm+' ('+this.x+','+this.y+')>';
	};

	speaker.prototype.draw = function(c) {
		Component.prototype.draw.call(this,c); 
		
		  
		this.draw_line(c,0,12,0,24); // fil haut
        this.draw_line(c,0,-12,0,-24); // fil bas
        this.draw_circle(c,0,0,12,false); // cercle principal
	    this.draw_line(c,-8,4,0,4); //carré-haut
        this.draw_line(c,-8,-4,0,-4); //carré-bas
        this.draw_line(c,-8,-4,-8,4); //carré-gauche
        this.draw_line(c,0,-4,0,4); //carré-gauche
        this.draw_line(c,0,4,6,8); //angle-haut
        this.draw_line(c,0,-4,6,-8); //angle-bas
        this.draw_line(c,6,8,6,-8); //vertical
		this.draw_text(c,"-",7,14,1,8);
		this.draw_text(c,"+",7,-22,1,8);
		
	   
	    if (this.properties.name)
	    	this.draw_text(c,this.properties.name,16,18,6,property_size);
	};
	
	
	speaker.prototype.clone = function(x,y) {
		return new speaker(x,y,this.rotation,this.properties.name,this.properties.vm);
	};

	

	////////////////////////////////////////////////////////////////////////////////
	//
	//  heatingelement
	//
	////////////////////////////////////////////////////////////////////////////////
	
  
	function heatingelement(x,y,rotation,name,am) {
		Component.call(this,'he',x,y,rotation);
		this.properties.name = name ? name :'E1';
		this.add_connection(0,-24);
		this.add_connection(0,24);
		this.bounding_box = [-12,-24,12,24];
		this.update_coords();
	}
	heatingelement.prototype = new Component();
	heatingelement.prototype.constructor = heatingelement;

	heatingelement.prototype.toString = function() {
		return '<heatingelement '+this.properties.vm+' ('+this.x+','+this.y+')>';
	};

	heatingelement.prototype.draw = function(c) {
		Component.prototype.draw.call(this,c); 
		
		  
		this.draw_line(c,0,-24,0,-14); //vertical
        this.draw_line(c,0,-14,4,-14); //horizontal
        this.draw_line(c,4,-14,4,-10); //vertical
        this.draw_line(c,4,-10,0,-10); //horizontal
        this.draw_line(c,0,-10,0,-6); //vertical
        this.draw_line(c,0,-6,4,-6); //horizontal
        this.draw_line(c,4,-6,4,-2); //vertical
        this.draw_line(c,4,-2,0,-2); //horizontal
		this.draw_line(c,0,-2,0,2); //vertical
        this.draw_line(c,0,2,4,2); //horizontal
        this.draw_line(c,4,2,4,6); //vertical
        this.draw_line(c,4,6,0,6); //horizontal
        this.draw_line(c,0,6,0,10); //vertical
        this.draw_line(c,0,10,4,10); //horizontal
        this.draw_line(c,4,10,4,14); //vertical
        this.draw_line(c,4,14,0,14); //horizontal
        this.draw_line(c,0,14,0,24); //vertical
	   
	    if (this.properties.name)
	    	this.draw_text(c,this.properties.name,16,18,6,property_size);
	};
	
	
	heatingelement.prototype.clone = function(x,y) {
		return new heatingelement(x,y,this.rotation,this.properties.name,this.properties.vm);
	};

	

	////////////////////////////////////////////////////////////////////////////////
	//
	//  relay
	//
	////////////////////////////////////////////////////////////////////////////////
	
  
	function relay(x,y,rotation,name,am) {
		Component.call(this,'re',x,y,rotation);
		this.properties.name = name ? name :'K1';
		this.add_connection(-16,-24);
		this.add_connection(-16,24);
        this.add_connection(16,-24);
		this.add_connection(16,24);
		this.bounding_box = [-24,-24,24,24];
		this.update_coords();
	}
	relay.prototype = new Component();
	relay.prototype.constructor = relay;

	relay.prototype.toString = function() {
		return '<relay '+this.properties.vm+' ('+this.x+','+this.y+')>';
	};

	relay.prototype.draw = function(c) {
		Component.prototype.draw.call(this,c); 
		
        //contact
        this.draw_line(c,16,-24,16,-12);
        this.draw_circle(c,  16,-10,2,false );
        this.draw_line(c,16,8,22,-12); //contact
		this.draw_circle(c,  16,10,2,false );
        this.draw_line(c,16,24,16,12);
        //bobine
        this.draw_line(c,-16,-24,-16,-16);
        this.draw_arc(c,-16,-12,4,6*Math.PI/4,2*Math.PI/4);
        this.draw_arc(c,-16,-4,4,6*Math.PI/4,2*Math.PI/4);
        this.draw_arc(c,-16,4,4,6*Math.PI/4,2*Math.PI/4);
        this.draw_arc(c,-16,12,4,6*Math.PI/4,2*Math.PI/4);
        this.draw_line(c,-16,24,-16,16)
        //pointillé
        this.draw_line(c,-10,0,-8,0)
        this.draw_line(c,-6,0,-4,0)
        this.draw_line(c,-2,0,0,0)
        this.draw_line(c,2,0,4,0)
        this.draw_line(c,6,0,8,0)
        this.draw_line(c,10,0,12,0)
		  	   
	    if (this.properties.name)
	    	this.draw_text(c,this.properties.name,20,20,6,property_size);
	};
	
	
	relay.prototype.clone = function(x,y) {
		return new relay(x,y,this.rotation,this.properties.name,this.properties.vm);
	};

	

	////////////////////////////////////////////////////////////////////////////////
	//
	//  cellpic
	//
	////////////////////////////////////////////////////////////////////////////////
	
  
	function cellpic(x,y,rotation,name,am) {
		Component.call(this,'cp',x,y,rotation);
		this.properties.name = name ? name :'P1';
		this.add_connection(0,-24);
		this.add_connection(0,24);
		this.bounding_box = [-7,-24,31,24];
		this.update_coords();
	}
	cellpic.prototype = new Component();
	cellpic.prototype.constructor = cellpic;

	cellpic.prototype.toString = function() {
		return '<cellpic '+this.properties.vm+' ('+this.x+','+this.y+')>';
	};

	cellpic.prototype.draw = function(c) {
		Component.prototype.draw.call(this,c); 
		
		  
		this.draw_line(c,0,-24,0,-3);
		//this.draw_line(c,0,-5,5,-5);
		this.draw_circle(c,0,0,12,false);
        this.draw_line(c,-6,-3,6,-3);
		this.draw_line(c,0,6,0,24);
        this.draw_arc(c,0,0,6,7.9*Math.PI/4,4.1*Math.PI/4);
		
	   
	    if (this.properties.name)
	    	this.draw_text(c,this.properties.name,16,18,6,property_size);
	};
	
	
	cellpic.prototype.clone = function(x,y) {
		return new cellpic(x,y,this.rotation,this.properties.name,this.properties.vm);
	};

	

	////////////////////////////////////////////////////////////////////////////////
	//
	//  buttonswitch
	//
	////////////////////////////////////////////////////////////////////////////////
	
  
	function buttonswitch(x,y,rotation,name,am) {
		Component.call(this,'bs',x,y,rotation);
		this.properties.name = name ? name :'Btn1';
		this.add_connection(0,-24);
		this.add_connection(0,24);
		this.bounding_box = [-24,-24,24,24];
		this.update_coords();
	}
	buttonswitch.prototype = new Component();
	buttonswitch.prototype.constructor = buttonswitch;

	buttonswitch.prototype.toString = function() {
		return '<buttonswitch '+this.properties.vm+' ('+this.x+','+this.y+')>';
	};

	buttonswitch.prototype.draw = function(c) {
		Component.prototype.draw.call(this,c); 
		
		  
		this.draw_line(c,0,-24,0,-12);
		this.draw_circle(c,0,-10,2,false);
        this.draw_line(c,-10,-14,-10,12);
        this.draw_line(c,-20,0,-10,0);
        this.draw_circle(c,0,10,2,false);
        this.draw_line(c,0,24,0,12);

		
	   
	    if (this.properties.name)
	    	this.draw_text(c,this.properties.name,16,18,6,property_size);
	};
	
	
	buttonswitch.prototype.clone = function(x,y) {
		return new buttonswitch(x,y,this.rotation,this.properties.name,this.properties.vm);
	};

	

	////////////////////////////////////////////////////////////////////////////////
	//
	//  magneticswitch
	//
	////////////////////////////////////////////////////////////////////////////////
	
  
	function magneticswitch(x,y,rotation,name,am) {
		Component.call(this,'ms',x,y,rotation);
		this.properties.name = name ? name :'S1';
		this.add_connection(0,-24);
		this.add_connection(0,24);
		this.bounding_box = [-24,-24,24,24];
		this.update_coords();
	}
	magneticswitch.prototype = new Component();
	magneticswitch.prototype.constructor = magneticswitch;

	magneticswitch.prototype.toString = function() {
		return '<magneticswitch '+this.properties.vm+' ('+this.x+','+this.y+')>';
	};

	magneticswitch.prototype.draw = function(c) {
		Component.prototype.draw.call(this,c); 
		 
		this.draw_line(c,0,-24,0,-20);

        this.draw_line(c,-10,-20,10,-20);
        this.draw_line(c,-10,20,10,20);
        this.draw_line(c,-10,-20,-10,20);
        this.draw_line(c,10,-20,10,20);

        this.draw_line(c,0,24,0,20);

        this.draw_line(c,1,-20,1,10);
        this.draw_line(c,-1,-10,-1,20);


		
	   
	    if (this.properties.name)
	    	this.draw_text(c,this.properties.name,16,18,6,property_size);
	};
	
	
	magneticswitch.prototype.clone = function(x,y) {
		return new magneticswitch(x,y,this.rotation,this.properties.name,this.properties.vm);
	};


	////////////////////////////////////////////////////////////////////////////////
	//
	//  moteur
	//
	////////////////////////////////////////////////////////////////////////////////
	
  
		function moteur(x,y,rotation,name,mo) {
		Component.call(this,'mo',x,y,rotation);
		this.properties.name = name ? name :'M1';
		//this.properties.r = r ? r : '1';
		this.add_connection(0,-24);
		this.add_connection(0,24);
		
		this.bounding_box = [-12,-24,12,24];
		this.update_coords();
	}
	moteur.prototype = new Component();
	moteur.prototype.constructor = moteur;

	moteur.prototype.toString = function() {
		return '<moteur '+this.properties.mo+' ('+this.x+','+this.y+')>';
	};

	moteur.prototype.draw = function(c) {
		Component.prototype.draw.call(this,c); 
		
		  // give superclass a shot
		this.draw_line(c,0,-24,0,-12);
	    this.draw_circle(c,0,0,12,false);
		this.draw_line(c,0,12,0,24);
		
				this.draw_text(c,"M",0,0,4,12, false);
				   
	   
	    if (this.properties.name)
	    	this.draw_text(c,this.properties.name,12,16,6,property_size);
	};
	
	moteur.prototype.clone = function(x,y) {
		return new moteur(x,y,this.rotation,this.properties.name,this.properties.vm);
	};

		////////////////////////////////////////////////////////////////////////////////
	//
	//  sonore
	//
	////////////////////////////////////////////////////////////////////////////////
	
  
	function sonore(x,y,rotation,name,mo) {
		Component.call(this,'so',x,y,rotation);
		this.properties.name = name ? name : 'B';
		//this.properties.r = r ? r : '1';
		this.add_connection(0,-24);
		this.add_connection(0,24);
		
		this.bounding_box = [-12,-24,12,24];
		this.update_coords();
	}
	sonore.prototype = new Component();
	sonore.prototype.constructor = sonore;

	sonore.prototype.toString = function() {
		return '<sonore '+this.properties.so+' ('+this.x+','+this.y+')>';
	};

	sonore.prototype.draw = function(c) {
		Component.prototype.draw.call(this,c); 
		this.draw_line(c,0,-24,0,-10);
		this.draw_circle(c,0,0,10,false);
		this.draw_circle(c,0,0,4,false);
		this.draw_line(c,0,10,0,24);
	   
	    if (this.properties.name)
	    	this.draw_text(c,this.properties.name,12,12,6,property_size);
	};
	
	sonore.prototype.clone = function(x,y) {
		return new sonore(x,y,this.rotation,this.properties.name,this.properties.vm);
	};
		////////////////////////////////////////////////////////////////////////////////
	//
	//  Interrupteurbascule
	//
	////////////////////////////////////////////////////////////////////////////////
	var Interrupteurbascule_types = ['bouvert','bferme', 'poussoir', 'magnetique', 'bidir'];
    function Interrupteurbascule(x,y,rotation,name,r, type) {
		Component.call(this,'r',x,y,rotation);
		this.properties.name = name ? name: "S1";
		this.properties.r = r ? r : '1';
		this.properties.type = type ;
		this.add_connection(0,-24);
		this.add_connection(0,24);
		this.bounding_box = [-14,-24,14,24];
		//this.bounding_box = (type == 'ferme') ? [-5,-24,5,24] : [-8,0,8,48];
		this.update_coords();
		
	}
	Interrupteurbascule.prototype = new Component();
	Interrupteurbascule.prototype.constructor = Interrupteurbascule;
	
	Interrupteurbascule.prototype.toString = function() {
		return '<Interrupteurbascule '+this.properties.r+' ('+this.x+','+this.y+')>';
	};
	
	Interrupteurbascule.prototype.draw = function(c) {
		Component.prototype.draw.call(this,c);    
		
		switch (this.properties.type)
		{
			case 'bferme':
				this.remove_connection();
				this.add_connection(0,-24);
				this.add_connection(0,24);
				c.strokeStyle = normal_style ;
				this.draw_line(c,0,-22,0,-12);
				this.draw_line(c,0,22,0,12);
		 		this.draw_circle(c,  0,-10,2,false );
				this.draw_circle(c,  0,10,2,false );
				this.draw_line(c,0,-12,0,12);
				
			break;
			case 'bouvert':
				this.remove_connection();
				this.add_connection(0,-24);
				this.add_connection(0,24);
				c.strokeStyle = normal_style ;
				this.draw_line(c,0,-22,0,-12);
				this.draw_line(c,0,22,0,12);
				this.draw_circle(c,  0,-10,2,false );
				this.draw_circle(c,  0,10,2,false );
				this.draw_line(c,-2,-8,-12,6);
				
			break;
			case 'poussoir':
				this.remove_connection();
				this.add_connection(0,-24);
				this.add_connection(0,24);
				c.strokeStyle = normal_style ;
				this.draw_line(c,0,-22,0,-12);
				this.draw_line(c,0,22,0,12);
					c.stroke();
					c.strokeStyle = normal_style ;
				this.draw_circle(c,  0,-10,2,false );
				this.draw_circle(c,  0,10,2,false );
				this.draw_line(c,-4,-8,-4,8);
				this.draw_line(c,-14,-0,-4,0);
			//	this.add_connection(0,24);
			break;
			case 'magnetique':
				this.remove_connection();
				this.add_connection(0,-24);
				this.add_connection(0,24);
				c.strokeStyle = normal_style ;
				this.draw_line(c,0,-22,0,-12);
				this.draw_line(c,0,22,0,12);
					c.stroke();
					c.strokeStyle = normal_style ;
					c.beginPath();
					this.moveTo(c, -4,-12 );
					this.lineTo(c, -4,12 );
					this.lineTo(c, 4, 12 );
					this.lineTo(c, 4,-12 );
					this.lineTo(c, -4,-12);
					c.stroke();
					this.draw_line(c,-1,-12,-1,5);
					this.draw_line(c,1,12,1,-5);
					//this.add_connection(0,24);
			break;
			case 'bidir':
				this.remove_connection();
				this.add_connection(0,-24);
				this.add_connection(-8,24);
			this.add_connection(8,24)
				c.strokeStyle = normal_style ;
				this.draw_line(c,0,-24,0,-12);
				this.draw_line(c,-8,24,-8,12);
				this.draw_line(c,8,24,8,12);
					
				this.draw_circle(c,  -0,-10,2,false );
				this.draw_circle(c,  -8,10,2,false );
				//this.draw_circle(c,  -8,-10,2,false );
				this.draw_circle(c,  8,10,2,false );
				this.draw_line(c,-2,-8,-12,6);
				
				c.stroke();
					
			break;
			default:
				
				c.strokeStyle = normal_style ;
				this.draw_line(c,0,-24,0,-12);
				this.draw_line(c,0,24,0,12);
					c.stroke();
					c.strokeStyle = normal_style ;
				this.draw_circle(c,  0,-10,2,false );
				this.draw_circle(c,  0,10,2,false );
				this.draw_line(c,-2,-8,-12,6);
			break;
			}
		
	    	/*if (this.properties.r)
			this.draw_text(c,this.properties.r+'\u03A9',20,20,5,property_size);*/
			if (this.properties.name)
			this.draw_text(c,this.properties.name,5,0,6, property_size, "#666665");
		};
		Interrupteurbascule.prototype.edit_properties = function(x,y) {
		if (inside(this.bbox,x,y)) {
			var fields = [];
			fields.name = build_input('text',10,this.properties.name);
						fields.type = build_select(Interrupteurbascule_types,this.properties.type);

			var content = build_table(fields);
			content.fields = fields;
			content.component = this;

			this.sch.dialog(window.parent.M.str.atto_circuit.edit_properties,content,function(content) {
				content.component.properties.name = content.fields.name.value;
				content.component.properties.type = Interrupteurbascule_types[content.fields.type.selectedIndex];
				content.component.sch.redraw_background();
			});
			return true;
		} else return false;
	};

	
	Interrupteurbascule.prototype.clone = function(x,y) {
		data = new Interrupteurbascule(x,y,this.rotation,this.properties.name,this.properties.r);
		console.log (data.rotation);
		return data;
		
	};
	

		////////////////////////////////////////////////////////////////////////////////
	//
	//  fusible
	//
	////////////////////////////////////////////////////////////////////////////////
	
    function fusible(x,y,rotation,name,f) {
		Component.call(this,'f',x,y,rotation);
		this.properties.name = name ? name : 'F1';
		this.add_connection(0,-24);
		this.add_connection(0,24);
		this.bounding_box = [-14,-24,14,24];//
		this.update_coords();
		
	}
	fusible.prototype = new Component();
	fusible.prototype.constructor = fusible;
	
	fusible.prototype.toString = function() {
		return '<fusible '+this.properties.r+' ('+this.x+','+this.y+')>';
	};
	
	fusible.prototype.draw = function(c) {
		Component.prototype.draw.call(this,c);   //give superclass a shot 
		c.strokeStyle = normal_style ;
		
		this.draw_line(c,0,-24,0,-8);
		this.draw_line(c,0,24,0,8);
		this.draw_line(c,0,-8,3,-8);
		this.draw_arc(c,3,-4,4,6*Math.PI/4,2*Math.PI/4);
		this.draw_line(c,-3,0,3,0);
		this.draw_arc(c,-3,4,4,-6*Math.PI/4,-2*Math.PI/4);
		this.draw_line(c,0,8,-3,8);
	   
		
	
		
	    /*if (this.properties.r)
			this.draw_text(c,this.properties.r+'\u03A9',20,20,5,property_size);*/
		if (this.properties.name)
			this.draw_text(c,this.properties.name,10,12,6,property_size);
	};


	
	fusible.prototype.clone = function(x,y) {
		return new fusible(x,y,this.rotation,this.properties.name,this.properties.f);
	};
	////////////////////////////////////////////////////////////////////////////////
	//
	//  Resistor
	//
	////////////////////////////////////////////////////////////////////////////////

	function Resistor(x,y,rotation,name,r) {
		Component.call(this,'r',x,y,rotation);
		this.properties.name = name ? name : 'R1';;
		this.properties.r = r ? r : '1';
		this.add_connection(0,-24);
		this.add_connection(0,24);
		this.bounding_box = [-5,-24,5,24];//
		this.update_coords();
		
	}
	Resistor.prototype = new Component();
	Resistor.prototype.constructor = Resistor;

	Resistor.prototype.toString = function() {
		return '<Resistor '+this.properties.r+' ('+this.x+','+this.y+')>';
	};

	Resistor.prototype.draw = function(c) {
		Component.prototype.draw.call(this,c);   //give superclass a shot 
		c.strokeStyle = normal_style ;
		c.beginPath();
		this.moveTo(c, 0,24 );
		this.lineTo(c, 0 ,12 );
    	this.lineTo(c, -3.717,10.37 );
    	this.lineTo(c, 4.11,6.456 );
    	this.lineTo(c, -3.717,2.545 );
    	this.lineTo(c, 4.11,-1.369 );
    	this.lineTo(c, -3.717,-5.282 );
    	this.lineTo(c, 4.11,-9.194 );
    	this.lineTo(c, 0,-12 );
    	this.lineTo(c, 0,-24 );
		c.stroke();
		
		
	    if (this.properties.r)
	    	this.draw_text(c,this.properties.r+'\u03A9',10,-2,6,property_size);
	    if (this.properties.name)
	    	this.draw_text(c,this.properties.name,10,12,6,property_size);
	};

	Resistor.prototype.clone = function(x,y) {
		return new Resistor(x,y,this.rotation,this.properties.name,this.properties.r);
	};
////////////////////////////////////////////////////////////////////////////////
	//
	//  Resistorvariable
	//
	////////////////////////////////////////////////////////////////////////////////

	function Resistorvariable(x,y,rotation,name,r) {
		Component.call(this,'r',x,y,rotation);
		this.properties.name = name;
		this.properties.r = r ? r : '1';
		this.add_connection(0,-24);
		this.add_connection(0,24);
		this.bounding_box = [-5,-24,5,24];//
		this.update_coords();
		
	}
	Resistorvariable.prototype = new Component();
	Resistorvariable.prototype.constructor = Resistorvariable;

	Resistorvariable.prototype.toString = function() {
		return '<Resistorvariable '+this.properties.r+' ('+this.x+','+this.y+')>';
	};

	Resistorvariable.prototype.draw = function(c) {
		Component.prototype.draw.call(this,c);   //give superclass a shot 
		c.strokeStyle = normal_style ;
		c.beginPath();
		this.moveTo(c, 0,24 );
		this.lineTo(c, 0.196,12.326 );
    	this.lineTo(c, -3.717,10.37 );
    	this.lineTo(c, 4.11,6.456 );
    	this.lineTo(c, -3.717,2.545 );
    	this.lineTo(c, 4.11,-1.369 );
    	this.lineTo(c, -3.717,-5.282 );
    	this.lineTo(c, 4.11,-9.194 );
    	this.lineTo(c, 0.196,-11.15 );
    	this.lineTo(c, 0.196,-24 );
    	/*this.lineTo(c, 0,12 );
    	this.lineTo(c, -4,10.5 );
    	this.lineTo(c, 4,2.5 );
    	this.lineTo(c, -4,1.5);
    	this.lineTo(c, 4,-1 );
    	this.lineTo(c, -4,-5.2 );
    	this.lineTo(c, 4,-9.2 );
    	this.lineTo(c, 0,-12 );
		this.lineTo(c, 0,-24 );*/
		c.fill();
		c.stroke();
		
		c.beginPath();
		c.strokeStyle = normal_style ;
		this.moveTo(c, -7.629,6.456 );
    	this.lineTo(c, 8.022,-5.282 );
    	this.lineTo(c, 8.022,-13.107);
		c.fill();
		c.stroke();

	    /*this.draw_line(c,0,0,0,12);
	    this.draw_line(c,0,12,4,14);
	    this.draw_line(c,4,14,-4,18);
	    this.draw_line(c,-4,18,4,22);
	    this.draw_line(c,4,22,-4,26);
	    this.draw_line(c,-4,26,4,30);
	    this.draw_line(c,4,30,-4,34);
	    this.draw_line(c,-4,34,0,36);
	    this.draw_line(c,0,36,0,48);*/
	    if (this.properties.r)
	    	this.draw_text(c,this.properties.r+'\u03A9',20,20,5,property_size);
	    if (this.properties.name)
	    	this.draw_text(c,this.properties.name,20,30,5,property_size);
	};

	Resistorvariable.prototype.clone = function(x,y) {
		return new Resistorvariable(x,y,this.rotation,this.properties.name,this.properties.r);
	};
	////////////////////////////////////////////////////////////////////////////////
	//
	//  Capacitor
	//
	////////////////////////////////////////////////////////////////////////////////

	function Capacitor(x,y,rotation,name,c) {
		Component.call(this,'c',x,y,rotation);
		this.properties.name = name;
		this.properties.c = c ? c : '1p';
		this.add_connection(0,0);
		this.add_connection(0,48);
		this.bounding_box = [-8,0,8,48];
		this.update_coords();
	}
	Capacitor.prototype = new Component();
	Capacitor.prototype.constructor = Capacitor;

	Capacitor.prototype.toString = function() {
		return '<Capacitor '+this.properties.r+' ('+this.x+','+this.y+')>';
	};

	Capacitor.prototype.draw = function(c) {
	    Component.prototype.draw.call(this,c);   // give superclass a shot
	    this.draw_line(c,0,0,0,22);
	    this.draw_line(c,-8,22,8,22);
	    this.draw_line(c,-8,26,8,26);
	    this.draw_line(c,0,26,0,48);
	    if (this.properties.c)
	    	this.draw_text(c,this.properties.c+'F',12,24,3,property_size);
	    if (this.properties.name)
	    	this.draw_text(c,this.properties.name,-12,24,5,property_size);
	};

	Capacitor.prototype.clone = function(x,y) {
		return new Capacitor(x,y,this.rotation,this.properties.name,this.properties.c);
	};

	////////////////////////////////////////////////////////////////////////////////
	//
	//  Inductor
	//
	////////////////////////////////////////////////////////////////////////////////

	function Inductor(x,y,rotation,name,l) {
		Component.call(this,'l',x,y,rotation);
		this.properties.name = name;
		this.properties.l = l ? l : '1n';
		this.add_connection(0,0);
		this.add_connection(0,48);
		this.bounding_box = [-4,0,5,48];
		this.update_coords();
	}
	Inductor.prototype = new Component();
	Inductor.prototype.constructor = Inductor;

	Inductor.prototype.toString = function() {
		return '<Inductor '+this.properties.l+' ('+this.x+','+this.y+')>';
	};

	Inductor.prototype.draw = function(c) {
	    Component.prototype.draw.call(this,c);   // give superclass a shot
	    this.draw_line(c,0,0,0,14);
	    this.draw_arc(c,0,18,4,6*Math.PI/4,3*Math.PI/4);
	    this.draw_arc(c,0,24,4,5*Math.PI/4,3*Math.PI/4);
	    this.draw_arc(c,0,30,4,5*Math.PI/4,2*Math.PI/4);
	    this.draw_line(c,0,34,0,48);

	    if (this.properties.l)
	    	this.draw_text(c,this.properties.l+'H',8,24,3,property_size);
	    if (this.properties.name)
	    	this.draw_text(c,this.properties.name,-8,24,5,property_size);
	};

	Inductor.prototype.clone = function(x,y) {
		return new Inductor(x,y,this.rotation,this.properties.name,this.properties.l);
	};

	////////////////////////////////////////////////////////////////////////////////
	//
	//  Diode
	//
	////////////////////////////////////////////////////////////////////////////////

	var diode_types = ['normal','DEL'];

	function Diode(x,y,rotation,name,type) {
		Component.call(this,'d',x,y,rotation);
		this.properties.name = name;
		//this.properties.area = area ? area : '1';
		this.properties.type = type ? type : 'normal';
	    this.add_connection(0,-24);   // anode
	    this.add_connection(0,24);  // cathode
	    this.bounding_box = (type == 'DEL') ? [-12,-24,12,24] : [-8,-24,8,24];
	    this.update_coords();
	}
	Diode.prototype = new Component();
	Diode.prototype.constructor = Diode;

	Diode.prototype.toString = function() {
		return '<Diode  ('+this.x+','+this.y+')>';
	};

	Diode.prototype.draw = function(c) {
	    Component.prototype.draw.call(this,c);   // give superclass a shot
	    this.draw_line(c, 0,-24,0,-6);
	    //this.draw_line(c,-8,-12,8,-12);
	    //this.draw_line(c,-8,18,0,30);
	    //this.draw_line(c, 8,18,0,30);
	    this.draw_line(c,-8,8,8,8);
		this.draw_line(c, 0,8,0,24);
		this.draw_text(c,"-",7,14,1,8);
		this.draw_text(c,"+",7,-22,1,8);

    	c.fillStyle = this.selected ? selected_style : component_style;
		c.beginPath();
		this.moveTo(c,-8,-6);			//arrow
    	this.lineTo(c,8,-6);
    	this.lineTo(c,0,8);
		this.lineTo(c,-8,-6);
		/*
    	this.moveTo(c,-8,18);			//arrow
    	this.lineTo(c,8,18);
    	this.lineTo(c,0,30);
    	this.lineTo(c,-8,18);*/
    	c.fill();

	    if (this.properties.type == 'DEL') {
		// put a box around an ideal diode
		this.draw_circle(c,0,0,12,false);
		this.draw_line(c,8,14,12,18);
		this.draw_line(c,12,12,16,16);
		}

		/*if (this.properties.area)
			this.draw_text(c,this.properties.area,10,24,3,property_size);*/
		if (this.properties.name)
			this.draw_text(c,this.properties.name,-10,24,5,property_size);
	};

	Diode.prototype.clone = function(x,y) {
		return new Diode(x,y,this.rotation,this.properties.name,this.properties.area,this.properties.type);
	};

	Diode.prototype.edit_properties = function(x,y) {
		if (inside(this.bbox,x,y)) {
			var fields = [];
			fields.name = build_input('text',10,this.properties.name);
			//fields.area = build_input('text',10,this.properties.area);
			fields.type = build_select(diode_types,this.properties.type);

			var content = build_table(fields);
			content.fields = fields;
			content.component = this;

			this.sch.dialog(window.parent.M.str.atto_circuit.edit_properties,content,function(content) {
				content.component.properties.name = content.fields.name.value;
				//content.component.properties.area = content.fields.area.value;
				content.component.properties.type = diode_types[content.fields.type.selectedIndex];
				content.component.sch.redraw_background();
			});
			return true;
		} else return false;
	};

	////////////////////////////////////////////////////////////////////////////////
	//
	//  NPN Transistor
	//
	////////////////////////////////////////////////////////////////////////////////

	function NPN(x,y,rotation,name,area,Ics,Ies,alphaF,alphaR) {
	    Component.call(this,'npn',x,y,rotation);
	    this.properties.name = name;
	    this.properties.area = area ? area : '1';
	    this.properties.Ics = Ics ? Ics : '1.0e-14';
	    this.properties.Ies = Ies ? Ies : '1.0e-14';
	    this.properties.alphaF = alphaF ? alphaF : '0.98';
	    this.properties.alphaR = alphaR ? alphaR : '0.1';
	    this.add_connection(0,0);   	// collector
	    this.add_connection(-16,24);  	// base
	    this.add_connection(0,48);  	// emitter
	    this.bounding_box = [-16,0,0,48];
	    this.update_coords();
	}
	NPN.prototype = new Component();
	NPN.prototype.constructor = NPN;

	NPN.prototype.toString = function() {
	    return '<NPN '+this.properties.area+' '+this.properties.Ics+' '+this.properties.Ies+' '+this.properties.alphaF+' '+ this.properties.alphaR+' ('+this.x+','+this.y+')>';
	};
    
	NPN.prototype.draw = function(c) {
	    Component.prototype.draw.call(this,c);
	    this.draw_line(c,0,0,0,16);		//collector vertical
	    this.draw_line(c,-8,20,0,16);	//collector slant stroke
	    this.draw_line(c,0,33,0,48);	//emitter vertical stroke
	    this.draw_line(c,-16,24,-8,24);	//base stroke
	    this.draw_line(c,-8,28,0,33);	//emitter slant stroke
    	
    	c.fillStyle = this.selected ? selected_style : component_style;
    	c.beginPath();
    	this.moveTo(c,-1,28);			//arrow
    	this.lineTo(c,1,34);
    	this.lineTo(c,-5,34);
    	this.lineTo(c,-1,28);
    	c.fill();

    	c.beginPath();
    	this.moveTo(c,-7,16);			//main vertical stroke
    	this.lineTo(c,-9,16);
    	this.lineTo(c,-9,32);
    	this.lineTo(c,-7,32);
    	this.lineTo(c,-7,16);
    	c.fill();

    	if (this.properties.name)
			this.draw_text(c,this.properties.name,2,20,0,property_size);
	};

	NPN.prototype.clone = function(x,y) {
	    return new NPN(x,y,this.rotation,this.properties.name,this.properties.area,this.properties.Ics,this.properties.Ies,this.properties.alphaF,this.properties.alphaR);
	};

	////////////////////////////////////////////////////////////////////////////////
	//
	//  PNP Transistor
	//
	////////////////////////////////////////////////////////////////////////////////

	function PNP(x,y,rotation,name,area,Ics,Ies,alphaF,alphaR) {
	    Component.call(this,'pnp',x,y,rotation);
	    this.properties.name = name;
	    this.properties.area = area ? area : '1';
	    this.properties.Ics = Ics ? Ics : '1.0e-14';
	    this.properties.Ies = Ies ? Ies : '1.0e-14';
	    this.properties.alphaF = alphaF ? alphaF : '0.98';
	    this.properties.alphaR = alphaR ? alphaR : '0.1';
	    this.add_connection(0,0);   	// collector
	    this.add_connection(-16,24);  	// base
	    this.add_connection(0,48);  	// emitter
	    this.bounding_box = [-16,0,0,48];
	    this.update_coords();
	}
	PNP.prototype = new Component();
	PNP.prototype.constructor = PNP;

	PNP.prototype.toString = function() {
	    return '<PNP '+this.properties.area+' '+this.properties.Ics+' '+this.properties.Ies+' '+this.properties.alphaF+' '+ this.properties.alphaR+' ('+this.x+','+this.y+')>';
	};
    
	PNP.prototype.draw = function(c) {
	    Component.prototype.draw.call(this,c);   // give superclass a shot
	    this.draw_line(c,0,0,0,16);		//collector vertical
	    this.draw_line(c,-8,20,0,16);	//collector slant stroke
	    this.draw_line(c,0,33,0,48);	//emitter vertical stroke
	    this.draw_line(c,-16,24,-8,24);	//base stroke
	    this.draw_line(c,-8,28,0,33);	//emitter slant stroke

    	c.fillStyle = this.selected ? selected_style : component_style;
    	c.beginPath();
    	this.moveTo(c,-1,28);			//arrow
    	this.lineTo(c,-7,28);
    	this.lineTo(c,-5,34);
    	this.lineTo(c,-1,28);
    	c.fill();

    	c.beginPath();
    	this.moveTo(c,-7,16);			//main vertical stroke
    	this.lineTo(c,-9,16);
    	this.lineTo(c,-9,32);
    	this.lineTo(c,-7,32);
    	this.lineTo(c,-7,16);
    	c.fill();

    	if (this.properties.name)
			this.draw_text(c,this.properties.name,2,20,0,property_size);
    };

	PNP.prototype.clone = function(x,y) {
	    return new PNP(x,y,this.rotation,this.properties.name,this.properties.area,this.properties.Ics,this.properties.Ies,this.properties.alphaF,this.properties.alphaR);
	};


	////////////////////////////////////////////////////////////////////////////////
	//
	//  N-channel Mosfet
	//
	////////////////////////////////////////////////////////////////////////////////

	function NFet(x,y,rotation,name,w_over_l) {
		Component.call(this,'n',x,y,rotation);
		this.properties.name = name;
		this.properties.WL = w_over_l ? w_over_l : '2';
	    this.add_connection(0,0);   // drain
	    this.add_connection(-24,24);  // gate
	    this.add_connection(0,48);  // pile
	    this.bounding_box = [-24,0,8,48];
	    this.update_coords();
	}
	NFet.prototype = new Component();
	NFet.prototype.constructor = NFet;

	NFet.prototype.toString = function() {
		return '<NFet '+this.properties.WL+' ('+this.x+','+this.y+')>';
	};

	NFet.prototype.draw = function(c) {
	    Component.prototype.draw.call(this,c);   // give superclass a shot
	    this.draw_line(c,0,0,0,16);
	    this.draw_line(c,-8,16,0,16);
	    this.draw_line(c,-8,16,-8,32);
	    this.draw_line(c,-8,32,0,32);
	    this.draw_line(c,0,32,0,48);
	    this.draw_line(c,-24,24,-12,24);
	    this.draw_line(c,-12,16,-12,32);

	    var dim = this.properties.WL;
	    if (this.properties.name) {
	    	this.draw_text(c,this.properties.name,6,22,6,property_size);
	    	this.draw_text(c,dim,6,26,0,property_size);
	    } else
	    this.draw_text(c,dim,6,24,3,property_size);
	};

	NFet.prototype.clone = function(x,y) {
		return new NFet(x,y,this.rotation,this.properties.name,this.properties.WL);
	};

	////////////////////////////////////////////////////////////////////////////////
	//
	//  P-channel Mosfet
	//
	////////////////////////////////////////////////////////////////////////////////

	function PFet(x,y,rotation,name,w_over_l) {
		Component.call(this,'p',x,y,rotation);
		this.properties.name = name;
		this.properties.WL = w_over_l ? w_over_l : '2';
	    this.add_connection(0,0);   // drain
	    this.add_connection(-24,24);  // gate
	    this.add_connection(0,48);  // pile
	    this.bounding_box = [-24,0,8,48];
	    this.update_coords();
	}
	PFet.prototype = new Component();
	PFet.prototype.constructor = PFet;

	PFet.prototype.toString = function() {
		return '<PFet '+this.properties.WL+' ('+this.x+','+this.y+')>';
	};

	PFet.prototype.draw = function(c) {
	    Component.prototype.draw.call(this,c);   // give superclass a shot
	    this.draw_line(c,0,0,0,16);
	    this.draw_line(c,-8,16,0,16);
	    this.draw_line(c,-8,16,-8,32);
	    this.draw_line(c,-8,32,0,32);
	    this.draw_line(c,0,32,0,48);
	    this.draw_line(c,-24,24,-16,24);
	    this.draw_circle(c,-14,24,2,false);
	    this.draw_line(c,-12,16,-12,32);

	    var dim = this.properties.WL;
	    if (this.properties.name) {
	    	this.draw_text(c,this.properties.name,6,22,6,property_size);
	    	this.draw_text(c,dim,6,26,0,property_size);
	    } else
	    this.draw_text(c,dim,6,24,3,property_size);
	};

	PFet.prototype.clone = function(x,y) {
		return new PFet(x,y,this.rotation,this.properties.name,this.properties.WL);
	};

	////////////////////////////////////////////////////////////////////////////////
	//
	//  Op Amp
	//
	////////////////////////////////////////////////////////////////////////////////

	function OpAmp(x,y,rotation,name,A) {
		Component.call(this,'o',x,y,rotation);
		this.properties.name = name;
		this.properties.A = A ? A : '30000';
	    this.add_connection(0,0);   // +
	    this.add_connection(0,16);  // -
	    this.add_connection(48,8);  // output
	    this.add_connection(24,16);  // ground
	    this.bounding_box = [0,-8,48,24];
	    this.update_coords();
	}
	OpAmp.prototype = new Component();
	OpAmp.prototype.constructor = OpAmp;

	OpAmp.prototype.toString = function() {
		return '<OpAmp'+this.properties.A+' ('+this.x+','+this.y+')>';
	};

	OpAmp.prototype.draw = function(c) {
	    Component.prototype.draw.call(this,c);   // give superclass a shot
	    // triangle
	    this.draw_line(c,8,-8,8,24);
	    this.draw_line(c,8,-8,32,8);
	    this.draw_line(c,8,24,32,8);
	    // inputs and output
	    this.draw_line(c,0,0,8,0);
	    this.draw_line(c,0,16,8,16);
	    //this.draw_text(c,'g',30,20,property_size);
	    this.draw_line(c,32,8,48,8);
	    this.draw_line(c,24,13,24,16);
	    // + and -
	    this.draw_line(c,10,0,14,0);
	    this.draw_line(c,12,-2,12,2);
	    this.draw_line(c,10,16,14,16);

	    if (this.properties.name)
	    	this.draw_text(c,this.properties.name,24,-8,0,property_size);
	};

	OpAmp.prototype.clone = function(x,y) {
		return new OpAmp(x,y,this.rotation,this.properties.name,this.properties.A);
	};

	////////////////////////////////////////////////////////////////////////////////
	//
	//  Pile
	//
	////////////////////////////////////////////////////////////////////////////////
	var Pile_types = ['Voltage_pile','Voltage_Batterie','Voltage_Alternatif','Voltage_Prise'];
	function Pile(x,y,rotation,name,type,volt) {
		Component.call(this,type,x,y,rotation);
		this.properties.name = name ? name : 'U1';;
		this.properties.volt = volt ? volt : '10';
		this.properties.type = type ? type : 'Voltage_pile';
		this.add_connection(0,24);
		this.add_connection(0,-24);
		this.bounding_box = [-12,-24,12,24];
		this.update_coords();
	    //this.content = document.createElement('div');  // used by edit_properties
	}
	Pile.prototype = new Component();
	Pile.prototype.constructor = Pile;

	Pile.prototype.toString = function() {
		return '<Pile '+this.properties.volt+' ('+this.x+','+this.y+')>';
	};

	Pile.prototype.draw = function(c) {
		Component.prototype.draw.call(this,c);   
		if (this.properties.type == 'Voltage_pile') {
			this.draw_line(c,0,-24,0,-2);
			this.draw_line(c,0,2,0,24);
			this.draw_line(c,-8,-2,8,-2);
			this.draw_line(c,-3,2,3,2);
			this.draw_text(c,"-",14,16,12,8);
			this.draw_text(c,"+",14,-24,12,8);
			}
		else if (this.properties.type == 'Voltage_Alternatif') {
			this.draw_line(c,0,-24,0,-12);
			this.draw_circle(c,0,0,12,false);
			this.draw_arc(c,0,-4,4,6*Math.PI/4,2*Math.PI/4);
			this.draw_arc(c,0,4,4,-6*Math.PI/4,-2*Math.PI/4);
			this.draw_line(c,0,12,0,24);
			}
		else if (this.properties.type == 'Voltage_Prise') {
			this.draw_line(c,0,-24,0,-4);
			this.draw_circle(c,0,0,12,false);
			this.draw_line(c,0,4,0,24);
			this.draw_line(c,-3,-4,3,-4);
			this.draw_line(c,-3,4,3,4);
			
		}
		else{
			this.draw_line(c,0,-24,0,-5);
			this.draw_line(c,0,5,0,24);
			this.draw_line(c,-8,1,8,1);
			this.draw_line(c,-3,5,3,5);
			this.draw_line(c,-8,-6,8,-6);
			this.draw_line(c,-3,-2,3,-2);
			this.draw_text(c,"-",14,16,12,8);
			this.draw_text(c,"+",14,-24,12,8);
		}
	   	

		if (this.properties.name)
			this.draw_text(c,this.properties.name,10,-2,6,property_size);
			if (this.properties.volt)
			this.draw_text(c,this.properties.volt +'V',10,20,6,property_size);
	};
	Pile.prototype.edit_properties = function(x,y) {
		if (inside(this.bbox,x,y)) {
			var fields = [];
			fields.name = build_input('text',10,this.properties.name);
			fields.volt = build_input('text',10,this.properties.volt);
			fields.type = build_select(Pile_types,this.properties.type);

			var content = build_table(fields);
			content.fields = fields;
			content.component = this;

			this.sch.dialog(window.parent.M.str.atto_circuit.edit_properties,content,function(content) {
				content.component.properties.name = content.fields.name.value;
				content.component.properties.volt = content.fields.volt.value;
				content.component.properties.type = Pile_types[content.fields.type.selectedIndex];
				content.component.sch.redraw_background();
			});
			return true;
		} else return false;
	};

	Pile.prototype.clone = function(x,y) {
		return new Pile(x,y,this.rotation,this.properties.name,this.properties.v);
	};

	////////////////////////////////////////////////////////////////////////////////
	//
	//  batterie
	//
	////////////////////////////////////////////////////////////////////////////////
	
	/*function batterie(x,y,rotation,name,type,r) {
		Component.call(this,type,x,y,rotation);
		this.properties.name = name;
		this.properties.r = r ? r : '10';
		this.add_connection(0,0);
		this.add_connection(0,48);
		this.bounding_box = [-12,0,12,48];
		this.update_coords();
	    //this.content = document.createElement('div');  // used by edit_properties
	}
	batterie.prototype = new Component();
	batterie.prototype.constructor = batterie;

	batterie.prototype.toString = function() {
		return '<batterie '+this.properties.r+' ('+this.x+','+this.y+')>';
	};

	batterie.prototype.draw = function(c) {
	    Component.prototype.draw.call(this,c);   // give superclass a shot
	    this.draw_line(c,0,0,0,22);
	    //this.draw_circle(c,0,24,12,false);
	    this.draw_line(c,0,26,0,48);

	    		// voltage pile
		// draw + and -
		
		this.draw_line(c,-8,25,8,25);
		this.draw_line(c,-3,29,3,29);
		this.draw_line(c,-8,18,8,18);
		this.draw_line(c,-3,22,3,22);
		
		this.draw_text(c,"-",14,40,12,8);
		this.draw_text(c,"+",14,0,12,8);
				//this.draw_line(c,8,6,16,6);*/
	    /*} else if (this.type == 'i') {  // current pile
		// draw arrow: pos to neg
		this.draw_line(c,0,15,0,32);
		this.draw_line(c,-3,26,0,32);
		this.draw_line(c,3,26,0,32);
		}*/
/*
		if (this.properties.name)
			this.draw_text(c,this.properties.name,20,18,2,property_size);
			if (this.properties.r)
			this.draw_text(c,this.properties.r +'V',20,30,2,property_size);
			
		
	};
	

	batterie.prototype.clone = function(x,y) {
		return new batterie(x,y,this.rotation,this.properties.name,this.properties.r);
	};

	*/
	///////////////////////////////////////////////////////////////////////////////
	//
	//  JQuery slider support for setting a component value
	//
	///////////////////////////////////////////////////////////////////////////////

	function component_slider(event,ui) {
		var sname = $(this).slider("option","schematic");

	    // set value of specified component
	    var cname = $(this).slider("option","component");
	    var pname = $(this).slider("option","property");
	    var suffix = $(this).slider("option","suffix");
	    if (typeof suffix != "string") suffix = "";

	    var v = ui.value;
	    $(this).slider("value",v);  // move slider's indicator

	    var choices = $(this).slider("option","choices");
	    if (choices instanceof Array) v = choices[v];

	    // selector may match several schematics
	    $("." + sname).each(function(index,element) {
	    	element.schematic.set_property(cname,pname,v.toString() + suffix);
	    });

	    // perform requested analysis
	    var analysis = $(this).slider("option","analysis");
	    if (analysis == "dc")
	    	$("." + sname).each(function(index,element) {
	    		element.schematic.dc_analysis();
	    	});

	    return false;
	}

	///////////////////////////////////////////////////////////////////////////////
	//
	//  Module definition
	//
	///////////////////////////////////////////////////////////////////////////////

	var module = {
		'Schematic': Schematic,
		'component_slider': component_slider
	};
	return module;
}());
