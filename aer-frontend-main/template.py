from utils.consts import training_modalities, training_week_2_times, training_week_3_times, training_week_4_times, training_week_5_times
from athlete_funcs import getATHLETEPARAMS, phaseWEEKLYDISTANCES


def decimal_to_min_sec(decimal_minutes):
    total_seconds = int(decimal_minutes * 60)  # Convert decimal minutes to total seconds
    minutes = total_seconds // 60
    seconds = total_seconds % 60
    return f"{minutes:02d}:{seconds:02d}"


def trainingLHR(threshold_pace, easy_pace, total_distance):
    #Easy params
    dist_easy = 0.8*total_distance
    time_easy = easy_pace*dist_easy
    time_easy_formatted = decimal_to_min_sec(time_easy)
    easy_pace_formatted = decimal_to_min_sec(easy_pace)
    #Threshold params
    dist_thr = 0.2*total_distance
    time_thr = threshold_pace*dist_thr
    time_thr_formatted = decimal_to_min_sec(time_thr)
    thr_pace_formatted = decimal_to_min_sec(threshold_pace)
    
    return (f'{dist_easy:.01f}km ({time_easy_formatted}min@{easy_pace_formatted}) + '
    f'{dist_thr:.01f}km ({time_thr_formatted}min@{thr_pace_formatted})')

def trainingEASY(easy_pace, total_distance):
    #Easy params
    dist_easy = total_distance
    time_easy = easy_pace*dist_easy
    time_easy_formatted = decimal_to_min_sec(time_easy)
    easy_pace_formatted = decimal_to_min_sec(easy_pace)
    
    return f'{dist_easy:.01f}km ({time_easy_formatted}min@{easy_pace_formatted})'

def trainingTEMPORUN(threshold_pace, easy_pace, total_distance, athlete_level):
    #WARMUP
    time_warmup = 10
    dist_warmup = time_warmup/easy_pace
    easy_pace_formatted = decimal_to_min_sec(easy_pace)
    
    #THRESHOLD SPLITS
    thr_dist = 0.3*total_distance
    thr_time = threshold_pace*thr_dist
    thr_pace_formatted = decimal_to_min_sec(threshold_pace)
    
    #BLOCK TIME RESTRICTION BASED ON LEVEL
    if (athlete_level == "Beginner") | (athlete_level == "Novice"):
        thr_time = 20 if thr_time > 20 else thr_time
    elif athlete_level == "Intermediate":
        thr_time = 25 if thr_time > 25 else thr_time
    elif athlete_level == "Advanced":
        thr_time = 30 if thr_time > 30 else thr_time
    else:
        thr_time = 35 if thr_time > 35 else thr_time

    #RECOVERY
    rec_dist = 0.05*total_distance
    rec_time = easy_pace*rec_dist
    #COOLDOWN
    cool_dist = total_distance - (rec_dist+2*thr_dist+dist_warmup)
    cool_time = easy_pace*cool_dist

    time_warmup_formatted = decimal_to_min_sec(time_warmup)
    thr_time_formatted = decimal_to_min_sec(thr_time)
    rec_time_formatted = decimal_to_min_sec(rec_time)
    cool_time_formatted = decimal_to_min_sec(cool_time)

    return (f'Warmup: {time_warmup_formatted}min ({dist_warmup:.01f}km@{easy_pace_formatted}); '
    f'Sets: 2x ({thr_time_formatted}min ({thr_dist:.01f}km@{thr_pace_formatted}) Rest: {rec_dist:.01f}km ({rec_time_formatted}min@{easy_pace_formatted})); '
    f'Cooldown: {cool_time_formatted}min ({cool_dist:.01f}km@{easy_pace_formatted})')

def trainingLONGTEMPO(threshold_pace, easy_pace, total_distance, athlete_level):
    #WARMUP
    time_warmup = 10
    dist_warmup = time_warmup/easy_pace
    easy_pace_formatted = decimal_to_min_sec(easy_pace)
    
    #THRESHOLD SPLITS
    thr_dist = 0.16*total_distance
    thr_time = threshold_pace*thr_dist
    thr_pace_formatted = decimal_to_min_sec(threshold_pace)
    
    #BLOCK TIME RESTRICTION BASED ON LEVEL
    if athlete_level == "Advanced":
        thr_time = 22.5 if thr_time > 22.5 else thr_time
    else:
        thr_time = 25 if thr_time > 25 else thr_time

    #RECOVERY
    rec_dist = 0.03*total_distance
    rec_time = easy_pace*rec_dist
    #COOLDOWN
    cool_dist = total_distance - (3*rec_dist+4*thr_dist+dist_warmup)
    cool_time = easy_pace*cool_dist

    time_warmup_formatted = decimal_to_min_sec(time_warmup)
    thr_time_formatted = decimal_to_min_sec(thr_time)
    rec_time_formatted = decimal_to_min_sec(rec_time)
    cool_time_formatted = decimal_to_min_sec(cool_time)

    return (f'Warmup: {time_warmup_formatted}min ({dist_warmup:.01f}km@{easy_pace_formatted}); '
    f'Sets: 4x ({thr_time_formatted}min ({thr_dist:.01f}km@{thr_pace_formatted}) Rest: {rec_time_formatted}min ({rec_dist:.01f}km @{easy_pace_formatted})); '
    f'Cooldown: {cool_time_formatted}min ({cool_dist:.01f}km@{easy_pace_formatted})')

def trainingINTERVALRUN(interval_pace, easy_pace, total_distance, athlete_level):
    #WARMUP
    time_warmup = 10
    dist_warmup = time_warmup/easy_pace
    easy_pace_formatted = decimal_to_min_sec(easy_pace)
    
    #INTERVAL SPLITS
    ###BLOCK DISTANCE RESTRICTION BASED ON LEVEL
    if (athlete_level == "Beginner") | (athlete_level == "Novice"):
        int_dist = .600
    elif athlete_level == "Intermediate":
        int_dist = .800
    elif athlete_level == "Advanced":
        int_dist = 1.000
    else:
        int_dist = 1.200
    int_time = interval_pace*int_dist
    int_pace_formatted = decimal_to_min_sec(interval_pace)
    
    #RECOVERY
    rec_dist = (2/8)*int_dist
    rec_time = 8.5*rec_dist

    #COOLDOWN
    cool_dist = total_distance - (5*rec_dist + 6*int_dist + dist_warmup)
    cool_time = easy_pace*cool_dist
    cool_time = 5 if cool_time < 5 else cool_time
    cool_dist = cool_time/easy_pace

    

    time_warmup_formatted = decimal_to_min_sec(time_warmup)
    int_time_formatted = decimal_to_min_sec(int_time)
    rec_time_formatted = decimal_to_min_sec(rec_time)
    cool_time_formatted = decimal_to_min_sec(cool_time)

    #EXCESS DISTANCE TO SEND TO EASY
    excess_distance = (cool_dist + 5*rec_dist + 6*int_dist + dist_warmup) - total_distance 
    
    return (f'Warmup: {time_warmup_formatted}min ({dist_warmup:.01f}km @{easy_pace_formatted}min/km); '
    f'Sets: 6x ({int_dist*1000:.0f}m @{int_pace_formatted}min/km ({int_time_formatted}min) Rest: {rec_time_formatted}min ({rec_dist*1000:.0f}m @8:30min/km)); '
    f'Cooldown: {cool_dist:.01f}km ({cool_time_formatted}min@{easy_pace_formatted})'), excess_distance

def trainingREPETITIONRUN(repetition_pace, easy_pace, total_distance, athlete_level):
    #WARMUP
    time_warmup = 10
    dist_warmup = time_warmup/easy_pace
    easy_pace_formatted = decimal_to_min_sec(easy_pace)
    
    #REPETITION SPLITS
    ###BLOCK DISTANCE RESTRICTION BASED ON LEVEL
    if (athlete_level == "Beginner") | (athlete_level == "Novice"):
        rep_dist = .200
    elif athlete_level == "Intermediate":
        rep_dist = .300
    elif athlete_level == "Advanced":
        rep_dist = .400
    else:
        rep_dist = .600
    rep_time = repetition_pace*rep_dist
    rep_pace_formatted = decimal_to_min_sec(repetition_pace)
    
    #RECOVERY
    rec_dist = rep_dist
    rec_time = 3
    rec_pace = rec_time/rec_dist

    #COOLDOWN
    cool_dist = total_distance - (7*rec_dist+8*rep_dist+dist_warmup)
    cool_time = easy_pace*cool_dist
    cool_time = 5 if cool_time < 5 else cool_time
    cool_dist = cool_time/easy_pace


    time_warmup_formatted = decimal_to_min_sec(time_warmup)
    rep_time_formatted = decimal_to_min_sec(rep_time)
    rec_time_formatted = decimal_to_min_sec(rec_time)
    rec_pace_formatted = decimal_to_min_sec(rec_pace)
    cool_time_formatted = decimal_to_min_sec(cool_time)

    #EXCESS DISTANCE TO SEND TO EASY
    excess_distance = (cool_dist + 7*rec_dist + 8*rep_dist + dist_warmup) - total_distance 
    
    return (f'Warmup: {time_warmup_formatted}min ({dist_warmup:.01f}km @{easy_pace_formatted}min/km); '
    f'Sets: 8x ({rep_dist*1000:.0f}m @{rep_pace_formatted}min/km ({rep_time_formatted}min) Rest: {rec_time_formatted}min ({rec_dist*1000:.0f}m @{rec_pace_formatted}min/km)); '
    f'Cooldown: {cool_dist:.01f}km ({cool_time_formatted}min@{easy_pace_formatted})'), excess_distance

def trainingCOMBORUN(repetition_pace, interval_pace, easy_pace, total_distance, athlete_level):
    #WARMUP
    time_warmup = 10
    dist_warmup = time_warmup/easy_pace
    easy_pace_formatted = decimal_to_min_sec(easy_pace)

    #REPETITION SPLITS
    ###BLOCK DISTANCE RESTRICTION BASED ON LEVEL
    if (athlete_level == "Beginner") | (athlete_level == "Novice"):
        rep_dist = .200
    elif athlete_level == "Intermediate":
        rep_dist = .300
        nr_splits=3
    elif athlete_level == "Advanced":
        rep_dist = .400
        nr_splits=4
    else:
        rep_dist = .600
        nr_splits=4
    rep_time = repetition_pace*rep_dist
    rep_pace_formatted = decimal_to_min_sec(repetition_pace)
    
    #RECOVERY1
    rec_dist = rep_dist
    rec_time = 3
    rec_pace = rec_time/rec_dist

    #INTERVAL SPLITS
    ###BLOCK DISTANCE RESTRICTION BASED ON LEVEL
    if (athlete_level == "Beginner") | (athlete_level == "Novice"):
        int_dist = .600
    elif athlete_level == "Intermediate":
        int_dist = .800
    elif athlete_level == "Advanced":
        int_dist = 1.000
    else:
        int_dist = 1.200
    int_time = interval_pace*int_dist
    int_pace_formatted = decimal_to_min_sec(interval_pace)
    
    #RECOVERY2
    rec2_dist = (2/8)*int_dist
    rec2_time = 8.5*rec2_dist

    #COOLDOWN
    cool_dist = total_distance - ((nr_splits-1)*rec2_dist+nr_splits*int_dist+nr_splits*rep_dist+dist_warmup)
    print(cool_dist)
    cool_time = easy_pace*cool_dist
    cool_time = 5 if cool_time < 5 else cool_time
    cool_dist = cool_time/easy_pace

    time_warmup_formatted = decimal_to_min_sec(time_warmup)
    int_time_formatted = decimal_to_min_sec(int_time)
    rep_time_formatted = decimal_to_min_sec(rep_time)
    rec_time_formatted = decimal_to_min_sec(rec_time)
    rec2_time_formatted = decimal_to_min_sec(rec2_time)
    rec_pace_formatted = decimal_to_min_sec(rec_pace)
    cool_time_formatted = decimal_to_min_sec(cool_time)
    
    return (f'Warmup: {time_warmup_formatted}min ({dist_warmup:.01f}km @{easy_pace_formatted}min/km);'
    f'Sets (Repetition): {nr_splits}x ({rep_dist*1000:.0f}m @{rep_pace_formatted}min/km ({rep_time_formatted}min) Rest: {rec_time_formatted}min ({rec_dist*1000:.0f}m @{rec_pace_formatted}min/km));'
    f'Sets (Interval): {nr_splits}x ({int_dist*1000:.0f}m @{int_pace_formatted}min/km ({int_time_formatted}min) Rest: {rec2_time_formatted}min ({rec2_dist*1000:.0f}m @8:30min/km));'
    f'Cooldown: {cool_dist:.01f}km ({cool_time_formatted}min@{easy_pace_formatted})')

def trainingSPLITS(training_frequency, initial_volume, phase_duration, vdot, progression_rate):

    paces_list, athlete_level = getATHLETEPARAMS(vdot=vdot)
    threshold_pace, interval_pace, repetition_pace, easy_pace = paces_list[0], paces_list[1], paces_list[2], paces_list[4]
    
    #Set training regimen based on frequency     
    if training_frequency==2:
        regimen = training_week_2_times
    elif training_frequency==3:
        regimen = training_week_3_times
    elif training_frequency==4:
        regimen = training_week_4_times
    elif training_frequency==5:
        regimen = training_week_5_times
    #Get training program schedule and distances
    training_program = {"phase1":[],"phase2":[],"phase3":[]}
    phase_weekly_distances = phaseWEEKLYDISTANCES(starting_km=initial_volume, weekly_progression_rate=progression_rate, phase_duration=phase_duration)
    
    #Access training presets and calculate values for specified parameters
    for phase_idx, phase in enumerate(phase_weekly_distances):
        #Access weekly distances
        for week_idx, week_dist in enumerate(phase):
            week_training = []
            weekly_distance = week_dist
            for j in range(0,training_frequency):
                #taper_condition = (((week_idx == phase_duration-2) and phase_idx==2) or (((week_idx == phase_duration-3) and phase_idx==2) and j==(training_frequency-1)))
                taper_condition = (((week_idx == phase_duration-1) and phase_idx==2) or (((week_idx == phase_duration-2) and phase_idx==2) and j==(training_frequency-1)))
                race_day_condition = ((week_idx == phase_duration-1) and phase_idx==2 and j==(training_frequency-1))
                #Get training index based on phase and week
                training_lists = regimen["phase1"][athlete_level]["training_presets"] if phase_idx == 0 else regimen["phase2_3"][athlete_level]["training_presets"]
                training_fractions_lists = regimen["phase1"][athlete_level]["training_fractions"] if phase_idx == 0 else regimen["phase2_3"][athlete_level]["training_fractions"]
                if len(training_lists)>1:
                        training_idx = training_lists[0][j] if (week_idx%2==0) else training_lists[1][j]
                        training_distance = training_fractions_lists[0][j]*weekly_distance if (week_idx%2==0) else training_fractions_lists[1][j]*weekly_distance
                        training_distance=training_distance*0.6 if taper_condition else training_distance
                else:
                    training_idx = training_lists[0][j]
                    training_distance = training_fractions_lists[0][j]*weekly_distance
                    training_distance=training_distance*0.6 if taper_condition else training_distance

                #GET TRAINING SESSION
                
                training_session = getTRAININGSESSION(training_idx=training_idx, threshold_pace=threshold_pace, interval_pace=interval_pace, 
                        repetition_pace=repetition_pace, easy_pace=easy_pace, total_distance=training_distance, athlete_level=athlete_level)
    
                if race_day_condition:
                    week_training.append(
                                {"training_title_en":"Race Day",
                                "training_title_pt":"Dia da Corrida",
                                "training_description_en":"This is what worked for, give your best!",
                                "training_description_pt":"Foi para isto que trabalhaste, dá o teu melhor!",
                                "total_training_distance":"",
                                "split_string":""
                                }
                            )
                else:
                    week_training.append(
                                {"training_title_en":training_modalities[training_idx]["title_en"]+" (Taper)" if taper_condition else training_modalities[training_idx]["title_en"],
                                "training_title_pt":training_modalities[training_idx]["title_pt"]+" (Taper)" if taper_condition else training_modalities[training_idx]["title_pt"],
                                "training_description_en":training_modalities[training_idx]["description_en"]+"One week before the race, we reduce your overall training volume by 60%, while maintaining intensity." if taper_condition else training_modalities[training_idx]["description_en"],
                                "training_description_pt":training_modalities[training_idx]["description_pt"]+"Uma semana antes da corrida, reduzimos o volume do teu treino em 60%, mantendo a intensidade de treino."if taper_condition else training_modalities[training_idx]["description_pt"],
                                "total_training_distance":round(training_distance,2),
                                "split_string":training_session
                                }
                            )
            training_program["phase"+str(phase_idx+1)].append(week_training)
    return training_program

def getTRAININGSESSION(training_idx, threshold_pace, interval_pace, repetition_pace, easy_pace, total_distance, athlete_level):
    
    if training_idx == 1:
        return trainingLHR(threshold_pace, easy_pace, total_distance)
    elif training_idx == 2:
        return trainingEASY(easy_pace, total_distance)
    elif training_idx == 3:
        return trainingTEMPORUN(threshold_pace, easy_pace, total_distance, athlete_level)
    elif training_idx == 5:
        return trainingINTERVALRUN(interval_pace, easy_pace, total_distance, athlete_level)
    elif training_idx == 6:
        return trainingREPETITIONRUN(repetition_pace, easy_pace, total_distance, athlete_level)
    elif training_idx == 7:
        return trainingCOMBORUN(repetition_pace, interval_pace, easy_pace, total_distance, athlete_level)
    elif training_idx == 8:
        return trainingEASY(easy_pace, total_distance)
    elif training_idx == 9:
        return trainingLONGTEMPO(threshold_pace, easy_pace, total_distance, athlete_level)